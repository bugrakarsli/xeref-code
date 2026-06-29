import * as vscode from 'vscode';
import { AuthManager } from './auth/AuthManager';
import { XerefClient } from './api/XerefClient';
import { AgentPanelView } from './views/AgentPanelView';
import { AgentManagerView } from './views/AgentManagerView';
import { SessionTreeProvider } from './views/SessionTreeProvider';
import { DiffContentProvider } from './runtime/DiffContentProvider';
import { registerCommands } from './commands/index';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const auth = new AuthManager(context.secrets);

  const endpoint = vscode.workspace.getConfiguration('xeref').get<string>('endpoint', 'https://xeref.ai');
  const client = new XerefClient({ endpoint, getToken: () => auth.getToken() });

  const sessions = new SessionTreeProvider(client);
  const diffContentProvider = new DiffContentProvider();
  const agentPanel = new AgentPanelView(context.extensionUri, auth, client, diffContentProvider, () => void sessions.load());
  const agentManager = new AgentManagerView(context.extensionUri, auth);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, diffContentProvider),
    vscode.window.registerWebviewViewProvider(AgentPanelView.viewId, agentPanel),
    vscode.window.registerWebviewViewProvider(AgentManagerView.viewId, agentManager),
    vscode.window.createTreeView('xeref.sessions', { treeDataProvider: sessions })
  );

  registerCommands(context, { auth, agentPanel, agentManager, sessions });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'xeref.signIn';
  context.subscriptions.push(statusBarItem);

  const refreshStatusBar = async () => {
    const connected = await auth.isConnected();
    statusBarItem.text = connected ? '$(check) Xeref' : '$(plug) Xeref: Connect';
    statusBarItem.command = connected ? 'xeref.openAgentPanel' : 'xeref.signIn';
    statusBarItem.show();

    // Only fetch when a token is present — avoids a noisy "not connected"
    // error on every cold start while signed out. A present-but-invalid
    // token still surfaces its real error via SessionTreeProvider.load().
    if (connected) {
      void sessions.load();
    } else {
      sessions.refresh([]);
    }
  };

  context.subscriptions.push(auth.onDidChangeAuth(() => void refreshStatusBar()));
  await refreshStatusBar();
}

export function deactivate(): void {
  statusBarItem?.dispose();
}
