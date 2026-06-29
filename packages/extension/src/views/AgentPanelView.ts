import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { AuthManager } from '../auth/AuthManager';
import type { XerefClient } from '../api/XerefClient';
import type { ChatMessage, CodeSession, HostToWebview, ModelId, WebviewToHost } from '../shared/messages';
import { RuntimeBridge } from '../runtime/RuntimeBridge';
import type { DiffContentProvider } from '../runtime/DiffContentProvider';

/**
 * Webview provider for the main chat surface ("AgentPanel", Ctrl+L).
 *
 * Deliberately isolated from AgentManagerView — this panel only ever streams
 * chat and renders diffs/steps; it has no agent-management UI and never
 * imports from it. All network calls go through XerefClient, here in the
 * host — the webview only ever sees postMessage traffic, never the token.
 *
 * Streaming: XerefClient.streamChat yields typed StreamEvents (parsed from
 * the AI SDK UI-message-stream protocol in uiMessageStream.ts). This view
 * only switches on those typed events — it never parses protocol text
 * itself — accumulates text-deltas into a structured assistant ChatMessage,
 * and forwards each delta to the webview via the existing `stream.delta`
 * wire message.
 */
export class AgentPanelView implements vscode.WebviewViewProvider {
  static readonly viewId = 'xeref.agentPanel';

  private view?: vscode.WebviewView;
  private currentSession?: CodeSession;
  private messages: ChatMessage[] = [];
  private currentModel?: ModelId;
  private readonly runtime = new RuntimeBridge();
  /** Tool calls awaiting Approve/Deny in the webview, keyed by toolCallId. */
  private readonly pendingToolCalls = new Map<string, { toolName: string; input: unknown }>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly auth: AuthManager,
    private readonly client: XerefClient,
    private readonly diffContentProvider: DiffContentProvider,
    private readonly onSessionCreated: (session: CodeSession) => void
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const { webview } = webviewView;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };

    webview.html = this.renderHtml(webview);

    webview.onDidReceiveMessage((message: WebviewToHost) => {
      void this.handleMessage(message);
    });

    this.auth.onDidChangeAuth((state) => {
      this.post({ type: 'auth.state', state });
    });
  }

  reveal(): void {
    this.view?.show?.(true);
  }

  /** Prefills the chat input with the selected text and file path, then reveals the panel. */
  sendSelection(text: string, filePath: string): void {
    this.reveal();
    this.post({ type: 'input.prefill', text: `\`\`\`// ${filePath}\n${text}\n\`\`\`\n` });
  }

  /** Opens an existing session: loads its history and pushes it to the webview. */
  async openSession(session: CodeSession): Promise<void> {
    this.reveal();
    try {
      this.messages = await this.client.getSessionMessages(session.id);
    } catch (err) {
      this.postError(err);
      return;
    }
    this.currentSession = session;
    this.currentModel = undefined;
    this.post({ type: 'session.loaded', session, messages: this.messages });
  }

  /** Creates a new session and opens it. Public so `xeref.newSession` can call it. */
  async newSession(): Promise<void> {
    try {
      const id = await this.client.createSession();
      const now = new Date().toISOString();
      const session: CodeSession = { id, title: 'New session', createdAt: now, updatedAt: now };
      this.currentSession = session;
      this.messages = [];
      this.currentModel = undefined;
      this.reveal();
      this.post({ type: 'session.loaded', session, messages: [] });
      this.onSessionCreated(session);
    } catch (err) {
      this.postError(err);
    }
  }

  private post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private postError(err: unknown): void {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    this.post({ type: 'chat.error', message });
  }

  private async handleMessage(message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case 'webview.ready':
        this.post({ type: 'auth.state', state: { connected: await this.auth.isConnected() } });
        if (this.currentSession) {
          this.post({ type: 'session.loaded', session: this.currentSession, messages: this.messages });
        }
        return;
      case 'session.new':
        await this.newSession();
        return;
      case 'chat.send':
        await this.sendChat(message.text, message.model);
        return;
      case 'tool.approve':
        await this.approveToolCall(message.toolCallId);
        return;
      case 'tool.deny':
        await this.denyToolCall(message.toolCallId);
        return;
      default:
        return;
    }
  }

  /**
   * Executes an approved tool call against the local workspace, then
   * round-trips the result: appends it as a resolved tool part on a new
   * assistant message and resumes the model's turn via runTurn(), so the
   * model actually sees the file content and continues.
   */
  private async approveToolCall(toolCallId: string): Promise<void> {
    const pending = this.pendingToolCalls.get(toolCallId);
    this.pendingToolCalls.delete(toolCallId);
    if (!pending) return;
    this.diffContentProvider.clear(toolCallId);

    if (pending.toolName === 'propose_edit') {
      await this.approveProposeEdit(toolCallId, pending.input);
      return;
    }

    if (pending.toolName !== 'read_file') {
      this.post({ type: 'tool.error', toolCallId, message: `"${pending.toolName}" isn't executable yet.` });
      return;
    }

    const input = pending.input as { path?: unknown };
    if (typeof input.path !== 'string') {
      this.post({ type: 'tool.error', toolCallId, message: 'read_file call is missing a path.' });
      return;
    }

    try {
      const content = await this.runtime.readFile(input.path);
      this.post({ type: 'tool.result', toolCallId, output: content });

      this.messages = [
        ...this.messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [
            {
              type: 'tool-read_file',
              toolCallId,
              state: 'output-available',
              input: { path: input.path },
              output: { content },
            },
          ],
        },
      ];
      await this.runTurn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file.';
      this.post({ type: 'tool.error', toolCallId, message });
    }
  }

  /** Reject path for a pending tool call. Unlike read_file (silent drop,
   * the model never learns the outcome), propose_edit's outputSchema is a
   * required boolean — the model is told `applied: false` so it can react
   * (apologize, ask a follow-up, try a different change) instead of stalling. */
  private async denyToolCall(toolCallId: string): Promise<void> {
    const pending = this.pendingToolCalls.get(toolCallId);
    this.pendingToolCalls.delete(toolCallId);
    this.diffContentProvider.clear(toolCallId);
    if (!pending || pending.toolName !== 'propose_edit') return;

    const input = pending.input as { path?: unknown; content?: unknown };
    if (typeof input.path !== 'string' || typeof input.content !== 'string') return;

    this.messages = [
      ...this.messages,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [
          {
            type: 'tool-propose_edit',
            toolCallId,
            state: 'output-available',
            input: { path: input.path, content: input.content },
            output: { applied: false },
          },
        ],
      },
    ];
    await this.runTurn();
  }

  private async approveProposeEdit(toolCallId: string, rawInput: unknown): Promise<void> {
    const input = rawInput as { path?: unknown; content?: unknown };
    if (typeof input.path !== 'string' || typeof input.content !== 'string') {
      this.post({ type: 'tool.error', toolCallId, message: 'propose_edit call is missing a path or content.' });
      return;
    }

    try {
      await this.runtime.writeFile(input.path, input.content);
      this.post({ type: 'tool.result', toolCallId, output: { applied: true } });

      this.messages = [
        ...this.messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [
            {
              type: 'tool-propose_edit',
              toolCallId,
              state: 'output-available',
              input: { path: input.path, content: input.content },
              output: { applied: true },
            },
          ],
        },
      ];
      await this.runTurn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to write file.';
      this.post({ type: 'tool.error', toolCallId, message });
    }
  }

  /** Opens the native VS Code diff editor (current on-disk content vs. the
   * proposed content) as soon as a propose_edit call streams in, so the
   * user can review the real diff before the Approve/Reject card resolves. */
  private async openProposeEditDiff(toolCallId: string, rawInput: unknown): Promise<void> {
    const input = rawInput as { path?: unknown; content?: unknown };
    if (typeof input.path !== 'string' || typeof input.content !== 'string') return;

    try {
      const original = await this.runtime.readFileOrEmpty(input.path);
      const leftUri = this.diffContentProvider.set(toolCallId, 'original', input.path, original);
      const rightUri = this.diffContentProvider.set(toolCallId, 'proposed', input.path, input.content);
      await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        `Xeref: ${input.path} (proposed edit)`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open diff.';
      this.post({ type: 'tool.error', toolCallId, message });
    }
  }

  private async sendChat(text: string, model?: ModelId): Promise<void> {
    if (!this.currentSession) {
      await this.newSession();
      if (!this.currentSession) return; // creation failed; error already posted
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text }],
    };
    this.messages = [...this.messages, userMessage];
    this.currentModel = model;
    await this.runTurn();
  }

  /**
   * Streams one model turn against the current `this.messages` and posts
   * deltas/tool-requests/errors to the webview. Called both for a fresh
   * user message (sendChat) and to resume after a tool result (approveToolCall)
   * — in both cases the request is just "continue from this message history".
   */
  private async runTurn(): Promise<void> {
    if (!this.currentSession) return;

    try {
      let assistantText = '';
      for await (const event of this.client.streamChat(this.currentSession.id, this.messages, this.currentModel)) {
        switch (event.type) {
          case 'text-delta':
            assistantText += event.delta;
            this.post({ type: 'stream.delta', text: event.delta });
            break;
          case 'tool-call': {
            this.pendingToolCalls.set(event.toolCallId, { toolName: event.toolName, input: event.input });
            const autoApply = vscode.workspace.getConfiguration('xeref').get<boolean>('autoApplyEdits', false);
            if (event.toolName === 'propose_edit' && autoApply) {
              void this.approveToolCall(event.toolCallId);
            } else {
              this.post({
                type: 'tool.requested',
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                input: event.input,
              });
              if (event.toolName === 'propose_edit') {
                void this.openProposeEditDiff(event.toolCallId, event.input);
              }
            }
            break;
          }
          case 'error':
            this.postError(new Error(event.message));
            return;
          case 'message-start':
          case 'message-done':
            // No UI action needed yet — message id / finish reason aren't
            // rendered in this milestone.
            break;
        }
      }
      this.messages = [
        ...this.messages,
        { id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text: assistantText }] },
      ];
      this.post({ type: 'stream.done' });
    } catch (err) {
      this.postError(err);
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'agent-panel', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'agent-panel', 'index.css')
    );
    const nonce = crypto.randomBytes(16).toString('base64');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Xeref Agent Panel</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
