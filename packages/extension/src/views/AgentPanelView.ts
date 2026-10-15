import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { AuthManager } from '../auth/AuthManager';
import { XerefApiError, type XerefClient } from '../api/XerefClient';
import type { ChatMessage, CodeSession, HostToWebview, ModelId, WebviewToHost } from '../shared/messages';
import type { AccountService } from '../state/AccountService';
import type { OnboardingStore } from '../state/OnboardingStore';
import type { SessionStore } from '../state/SessionStore';
import { currentAuthState } from '../state/authState';
import { RuntimeBridge } from '../runtime/RuntimeBridge';
import type { DiffContentProvider } from '../runtime/DiffContentProvider';

/**
 * Tools the extension itself executes and asks the user to approve. Any other tool name in the
 * stream (list_tasks, web_search, …) is executed by the Xeref server before the result reaches
 * us, so it must not surface an approval card the extension can't act on.
 */
const CLIENT_TOOLS: ReadonlySet<string> = new Set(['read_file', 'propose_edit']);

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
    private readonly accounts: AccountService,
    private readonly onboarding: OnboardingStore,
    private readonly sessions: SessionStore
  ) {
    // Registered once for the provider's lifetime; post() is a no-op while no view is resolved.
    this.auth.onDidChangeAuth(() => void this.pushAuth());
    this.accounts.onDidChange((snapshot) => {
      if (snapshot.status === 'ready') {
        this.post({ type: 'account.data', account: snapshot.account, fetchedAt: snapshot.fetchedAt });
      }
      void this.pushAuth();
      this.pushConfig();
    });
    vscode.window.onDidChangeActiveTextEditor(() => this.pushEditorContext());
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('xeref.autoApplyEdits') || e.affectsConfiguration('xeref.defaultModel')) {
        this.pushConfig();
      }
    });
  }

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

  }

  reveal(): void {
    this.view?.show?.(true);
  }

  /** Prefills the chat input with the selected text and file path, then reveals the panel. */
  sendSelection(text: string, filePath: string): void {
    void this.onboarding.complete('sendSelection');
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
    this.sessions.setActive(session.id);
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
      this.sessions.add(session);
    } catch (err) {
      this.postError(err);
    }
  }

  private post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private postError(err: unknown): void {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    this.post({ type: 'chat.error', message, code: err instanceof XerefApiError ? err.code : undefined });
  }

  private async pushAuth(): Promise<void> {
    this.post({ type: 'auth.state', state: await currentAuthState(this.auth, this.accounts) });
  }

  private pushConfig(): void {
    const config = vscode.workspace.getConfiguration('xeref');
    this.post({
      type: 'config.state',
      autoApplyEdits: config.get<boolean>('autoApplyEdits', false),
      defaultModel: config.get<string>('defaultModel', 'xeref-free'),
    });
  }

  /** The active editor's workspace-relative path, for the "active file" chip. Non-file tabs clear it. */
  private pushEditorContext(): void {
    const fileName = this.activeFilePath() ?? null;
    this.post({ type: 'editor.context', fileName });
  }

  private async handleMessage(message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case 'webview.ready':
        await this.pushAuth();
        this.pushConfig();
        this.pushEditorContext();
        if (this.accounts.current.status === 'ready') {
          this.post({
            type: 'account.data',
            account: this.accounts.current.account,
            fetchedAt: this.accounts.current.fetchedAt,
          });
        }
        void this.accounts.refresh();
        if (this.currentSession) {
          this.post({ type: 'session.loaded', session: this.currentSession, messages: this.messages });
        }
        return;
      case 'session.new':
        await this.newSession();
        return;
      case 'chat.send':
        await this.sendChat(message.text, message.model, message.includeActiveFile === true);
        return;
      case 'tool.approve':
        this.noteEditReviewed(message.toolCallId);
        await this.approveToolCall(message.toolCallId);
        return;
      case 'tool.deny':
        this.noteEditReviewed(message.toolCallId);
        await this.denyToolCall(message.toolCallId);
        return;
      case 'config.setAutoApply':
        await vscode.workspace
          .getConfiguration('xeref')
          .update('autoApplyEdits', message.value === true, vscode.ConfigurationTarget.Global);
        return;
      case 'ui.openExternal':
        await vscode.commands.executeCommand('xeref.openExternal', message.path);
        return;
      case 'command.run':
        if (message.id === 'xeref.signIn') await vscode.commands.executeCommand(message.id);
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

  /** Counts a reviewed propose_edit toward the Learn checklist (read_file approvals do not count). */
  private noteEditReviewed(toolCallId: string): void {
    if (this.pendingToolCalls.get(toolCallId)?.toolName === 'propose_edit') {
      void this.onboarding.complete('reviewEdit');
    }
  }

  private async sendChat(text: string, model?: ModelId, includeActiveFile = false): Promise<void> {
    if (!this.currentSession) {
      await this.newSession();
      if (!this.currentSession) return; // creation failed; error already posted
    }

    void this.onboarding.complete('firstChat');
    const defaultModel = vscode.workspace.getConfiguration('xeref').get<string>('defaultModel', 'xeref-free');
    if (model && model !== defaultModel) void this.onboarding.complete('tryModel');

    // Only the path travels with the message; the agent reads contents through approved tools.
    const activeFile = includeActiveFile ? this.activeFilePath() : undefined;
    if (activeFile) text = `[Active file: ${activeFile}]\n${text}`;

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
            if (!CLIENT_TOOLS.has(event.toolName)) break;
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

  private activeFilePath(): string | undefined {
    const doc = vscode.window.activeTextEditor?.document;
    return doc && doc.uri.scheme === 'file' ? vscode.workspace.asRelativePath(doc.uri) : undefined;
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
