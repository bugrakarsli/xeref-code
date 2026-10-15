import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { AuthManager } from '../auth/AuthManager';
import type { HostToWebview, MilestoneId, WebviewToHost } from '../shared/messages';
import type { AccountService, AccountSnapshot } from '../state/AccountService';
import type { OnboardingStore } from '../state/OnboardingStore';
import type { SessionStore } from '../state/SessionStore';
import { currentAuthState } from '../state/authState';
import { openSitePath } from '../api/sitePath';

/** Commands a webview may ask the host to run. Anything else is ignored. */
const RUNNABLE_COMMANDS: ReadonlySet<string> = new Set([
  'xeref.signIn',
  'xeref.signOut',
  'xeref.openAgentPanel',
  'xeref.newSession',
]);

/** What "Show me" does for each Learn step. */
const SHOW_ME: Record<MilestoneId, { command: string; hint?: string }> = {
  connect: { command: 'xeref.signIn' },
  firstChat: { command: 'xeref.openAgentPanel' },
  sendSelection: {
    command: 'xeref.openAgentPanel',
    hint: 'Select some code in the editor, right-click and choose "Xeref: Send Selection to Agent".',
  },
  reviewEdit: {
    command: 'xeref.openAgentPanel',
    hint: 'Ask Xeref to change a file. Its edit opens as a diff you approve or deny.',
  },
  tryModel: { command: 'xeref.openAgentPanel', hint: 'Open the model chip under the message box to pick another model.' },
};

/**
 * Webview provider for "Account & Sessions" (Ctrl+E): the account and usage summary with its
 * View details popup, the Learn checklist, and the session list.
 *
 * Structurally separate from AgentPanelView (the chat surface). It never streams chat; it only
 * reads shared state (AccountService, SessionStore, OnboardingStore) and asks the host to run
 * allow-listed commands. The token never reaches the webview.
 */
export class AgentManagerView implements vscode.WebviewViewProvider {
  static readonly viewId = 'xeref.agentManager';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly auth: AuthManager,
    private readonly accounts: AccountService,
    private readonly onboarding: OnboardingStore,
    private readonly sessions: SessionStore,
    private readonly getEndpoint: () => string
  ) {
    this.auth.onDidChangeAuth(() => void this.pushAuth());
    this.accounts.onDidChange((snapshot) => {
      this.pushAccount(snapshot);
      void this.pushAuth();
    });
    this.onboarding.onDidChange((state) => this.post({ type: 'onboarding.state', state }));
    this.sessions.onDidChange((s) => this.post({ type: 'sessions.list', ...s }));
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

    // Numbers can go stale while the view is hidden; refresh when it is shown again (60 s cache).
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) void this.accounts.refresh();
    });
  }

  reveal(): void {
    this.view?.show?.(true);
  }

  /** Reveals the view and opens the Account & Usage popup (status bar click, command palette). */
  async openAccountDetails(): Promise<void> {
    await vscode.commands.executeCommand(`${AgentManagerView.viewId}.focus`);
    this.post({ type: 'account.open' });
    void this.accounts.refresh(true);
  }

  private post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private async pushAuth(): Promise<void> {
    this.post({ type: 'auth.state', state: await currentAuthState(this.auth, this.accounts) });
  }

  private pushAccount(snapshot: AccountSnapshot): void {
    switch (snapshot.status) {
      case 'loading':
        this.post({ type: 'account.loading' });
        // Keep showing the previous numbers while refreshing.
        if (snapshot.previous) {
          this.post({ type: 'account.data', account: snapshot.previous.account, fetchedAt: snapshot.previous.fetchedAt });
        }
        return;
      case 'ready':
        this.post({ type: 'account.data', account: snapshot.account, fetchedAt: snapshot.fetchedAt });
        return;
      case 'error':
        this.post({ type: 'account.error', message: snapshot.message, code: snapshot.code });
        return;
      case 'idle':
        return;
    }
  }

  private async handleMessage(message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case 'webview.ready':
        await this.pushAuth();
        this.post({ type: 'onboarding.state', state: this.onboarding.state });
        this.post({ type: 'sessions.list', ...this.sessions.snapshot });
        if (await this.auth.isConnected()) {
          this.pushAccount(this.accounts.current);
          void this.accounts.refresh();
        }
        return;
      case 'account.get':
        await this.accounts.refresh(message.force === true);
        return;
      case 'ui.openExternal':
        await this.openExternal(message.path);
        return;
      case 'onboarding.dismiss':
        await this.onboarding.dismiss(message.what);
        return;
      case 'onboarding.step':
        await this.showMe(message.id);
        return;
      case 'command.run':
        if (RUNNABLE_COMMANDS.has(message.id)) await vscode.commands.executeCommand(message.id);
        return;
      case 'session.new':
        await vscode.commands.executeCommand('xeref.newSession');
        return;
      case 'session.open': {
        const session = this.sessions.find(message.id);
        if (session) await vscode.commands.executeCommand('xeref.openSession', session);
        return;
      }
      case 'session.delete':
        await this.deleteSession(message.id);
        return;
      case 'sessions.refresh':
        await this.sessions.load();
        return;
      default:
        return;
    }
  }

  private async openExternal(path: string): Promise<void> {
    await openSitePath(this.getEndpoint(), path);
  }

  private async showMe(id: MilestoneId): Promise<void> {
    const step = SHOW_ME[id];
    if (!step) return;
    await vscode.commands.executeCommand(step.command);
    if (step.hint) void vscode.window.showInformationMessage(`Xeref Code: ${step.hint}`);
  }

  private async deleteSession(id: string): Promise<void> {
    const session = this.sessions.find(id);
    const choice = await vscode.window.showWarningMessage(
      `Delete "${session?.title ?? 'this session'}"? This cannot be undone.`,
      { modal: true },
      'Delete'
    );
    if (choice !== 'Delete') return;
    try {
      await this.sessions.remove(id);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Xeref Code: could not delete the session. ${err instanceof Error ? err.message : ''}`.trim()
      );
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'agent-manager', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'agent-manager', 'index.css')
    );
    const nonce = crypto.randomBytes(16).toString('base64');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Xeref Account and Sessions</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
