import * as vscode from 'vscode';
import { AuthManager } from './auth/AuthManager';
import { XerefClient } from './api/XerefClient';
import { AgentPanelView } from './views/AgentPanelView';
import { AgentManagerView } from './views/AgentManagerView';
import { DiffContentProvider } from './runtime/DiffContentProvider';
import { AccountService } from './state/AccountService';
import { OnboardingStore } from './state/OnboardingStore';
import { SessionStore } from './state/SessionStore';
import { registerCommands } from './commands/index';

let statusBarItem: vscode.StatusBarItem;

/** `packageJSON` is typed `any` by VS Code; narrow it instead of trusting it. */
function readVersion(packageJson: unknown): string {
  if (typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson) {
    const { version } = packageJson;
    if (typeof version === 'string') return version;
  }
  return '0.0.0';
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const auth = new AuthManager(context.secrets);

  const endpoint = vscode.workspace.getConfiguration('xeref').get<string>('endpoint', 'https://xeref.ai');
  const client = new XerefClient({ endpoint, getToken: () => auth.getToken() });

  const accounts = new AccountService(client, () => auth.isConnected());
  const onboarding = new OnboardingStore(context.globalState, readVersion(context.extension.packageJSON));
  const sessions = new SessionStore(client);
  const diffContentProvider = new DiffContentProvider();
  const agentPanel = new AgentPanelView(
    context.extensionUri,
    auth,
    client,
    diffContentProvider,
    accounts,
    onboarding,
    sessions
  );
  const agentManager = new AgentManagerView(context.extensionUri, auth, accounts, onboarding, sessions, () => endpoint);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, diffContentProvider),
    vscode.window.registerWebviewViewProvider(AgentPanelView.viewId, agentPanel),
    vscode.window.registerWebviewViewProvider(AgentManagerView.viewId, agentManager)
  );

  registerCommands(context, { auth, client, agentPanel, agentManager, sessions, endpoint });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(statusBarItem);

  const PLAN_LABEL = { free: 'Free', pro: 'Pro', ultra: 'Ultra' } as const;

  const renderStatusBar = async () => {
    const connected = await auth.isConnected();
    const plan = accounts.account?.plan;
    statusBarItem.text = connected
      ? `$(check) Xeref${plan ? ` · ${PLAN_LABEL[plan]}` : ''}`
      : '$(plug) Xeref: Connect';
    statusBarItem.tooltip = connected ? 'Xeref Code: Account & Usage' : 'Connect your Xeref account';
    statusBarItem.command = connected ? 'xeref.openAccount' : 'xeref.signIn';
    statusBarItem.show();
  };

  const onAuthChanged = async () => {
    if (await auth.isConnected()) {
      void onboarding.complete('connect');
      // Sessions are plan-gated (Ultra). Once the account says Xeref Code is not included, skip
      // the request instead of raising a "requires the ultra plan" error toast on every start.
      // If the account cannot be read (older server), still try: the sessions call decides.
      void accounts.refresh(true).then(() => {
        if (accounts.account?.features.xeref_code === false) sessions.reset();
        else void sessions.load();
      });
    } else {
      accounts.clear();
      sessions.reset();
    }
    await renderStatusBar();
  };

  context.subscriptions.push(
    auth.onDidChangeAuth(() => void onAuthChanged()),
    accounts.onDidChange(() => void renderStatusBar())
  );
  await onAuthChanged();
}

export function deactivate(): void {
  statusBarItem?.dispose();
}
