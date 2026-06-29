import * as vscode from 'vscode';
import type { AuthManager } from '../auth/AuthManager';
import type { AgentPanelView } from '../views/AgentPanelView';
import type { AgentManagerView } from '../views/AgentManagerView';
import type { SessionTreeProvider } from '../views/SessionTreeProvider';
import type { CodeSession } from '../shared/messages';

interface CommandDeps {
  auth: AuthManager;
  agentPanel: AgentPanelView;
  agentManager: AgentManagerView;
  sessions: SessionTreeProvider;
}

/** Registers all `xeref.*` commands. Webviews never act directly — every
 * user action funnels through here so behavior stays auditable in one place. */
export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { auth, agentPanel, agentManager, sessions } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand('xeref.openAgentPanel', () => agentPanel.reveal()),
    vscode.commands.registerCommand('xeref.openAgentManager', () => agentManager.reveal()),
    vscode.commands.registerCommand('xeref.signIn', () => auth.signIn()),
    vscode.commands.registerCommand('xeref.signOut', () => auth.signOut()),
    vscode.commands.registerCommand('xeref.sessions.refresh', () => sessions.load()),
    vscode.commands.registerCommand('xeref.openSession', (session: CodeSession) => agentPanel.openSession(session)),
    vscode.commands.registerCommand('xeref.newSession', () => agentPanel.newSession()),
    vscode.commands.registerCommand('xeref.sendSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) return;
      const text = editor.document.getText(editor.selection);
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      agentPanel.sendSelection(text, filePath);
    })
  );
}
