import * as vscode from 'vscode';
import type { AuthManager } from '../auth/AuthManager';
import type { XerefClient } from '../api/XerefClient';
import { openSitePath } from '../api/sitePath';
import type { AgentPanelView } from '../views/AgentPanelView';
import type { AgentManagerView } from '../views/AgentManagerView';
import type { SessionStore } from '../state/SessionStore';
import type { CodeSession } from '../shared/messages';

interface CommandDeps {
  auth: AuthManager;
  client: XerefClient;
  agentPanel: AgentPanelView;
  agentManager: AgentManagerView;
  sessions: SessionStore;
  endpoint: string;
}

/** Registers all `xeref.*` commands. Webviews never act directly — every
 * user action funnels through here so behavior stays auditable in one place. */
export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { auth, client, agentPanel, agentManager, sessions, endpoint } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand('xeref.openAgentPanel', () => agentPanel.reveal()),
    vscode.commands.registerCommand('xeref.openAgentManager', () => agentManager.reveal()),
    vscode.commands.registerCommand('xeref.openAccount', () => agentManager.openAccountDetails()),
    // Token is verified against /api/code/account before it is stored (401 = rejected).
    vscode.commands.registerCommand('xeref.signIn', () => auth.signIn((token) => client.getAccount(token))),
    vscode.commands.registerCommand('xeref.signOut', () => auth.signOut()),
    vscode.commands.registerCommand('xeref.sessions.refresh', () => sessions.load()),
    vscode.commands.registerCommand('xeref.openSession', (session: CodeSession) => agentPanel.openSession(session)),
    vscode.commands.registerCommand('xeref.newSession', () => agentPanel.newSession()),
    // Internal: lets the chat webview open site pages (upgrade, manage account) via the host.
    vscode.commands.registerCommand('xeref.openExternal', (path: unknown) =>
      typeof path === 'string' ? openSitePath(endpoint, path) : false
    ),
    vscode.commands.registerCommand('xeref.sendSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) return;
      const text = editor.document.getText(editor.selection);
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      agentPanel.sendSelection(text, filePath);
    })
  );
}
