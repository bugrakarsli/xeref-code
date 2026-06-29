import * as vscode from 'vscode';
import type { CodeSession } from '../shared/messages';
import type { XerefClient } from '../api/XerefClient';

/**
 * Session history tree (Sessions view). Native TreeDataProvider — cheap,
 * keyboard-navigable, themed for free. Do not rebuild this as a webview.
 *
 * Backed by GET /api/code/sessions via XerefClient. `load()` does the
 * network fetch; `refresh()` just re-renders the current in-memory list
 * (used to clear the tree on sign-out without an extra request).
 */
export class SessionTreeProvider implements vscode.TreeDataProvider<CodeSession> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: CodeSession[] = [];

  constructor(private readonly client: XerefClient) {}

  async load(): Promise<void> {
    try {
      this.sessions = await this.client.listSessions();
    } catch (err) {
      this.sessions = [];
      const message = err instanceof Error ? err.message : 'Failed to load sessions';
      void vscode.window.showErrorMessage(`Xeref Code: ${message}`);
    }
    this._onDidChangeTreeData.fire();
  }

  refresh(sessions: CodeSession[] = this.sessions): void {
    this.sessions = sessions;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CodeSession): vscode.TreeItem {
    const item = new vscode.TreeItem(element.title, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = element.repoFullName;
    item.iconPath = new vscode.ThemeIcon('comment-discussion');
    item.command = {
      command: 'xeref.openSession',
      title: 'Open Session',
      arguments: [element],
    };
    return item;
  }

  getChildren(): vscode.ProviderResult<CodeSession[]> {
    return this.sessions;
  }
}
