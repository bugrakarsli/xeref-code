import * as vscode from 'vscode';

/**
 * Serves in-memory text under a custom `xeref-diff:` scheme so a
 * propose_edit's original/proposed content can be opened in VS Code's
 * native diff editor (vscode.diff) without writing anything to disk first.
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'xeref-diff';

  private readonly content = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? '';
  }

  /** Registers content under a Uri unique to this toolCallId+side and
   * returns that Uri for use with vscode.diff. */
  set(toolCallId: string, side: 'original' | 'proposed', path: string, text: string): vscode.Uri {
    const uri = vscode.Uri.parse(`${DiffContentProvider.scheme}:/${toolCallId}/${side}/${path}`);
    this.content.set(uri.toString(), text);
    return uri;
  }

  /** Frees the in-memory content once a tool call has been approved/denied. */
  clear(toolCallId: string): void {
    for (const key of this.content.keys()) {
      if (key.startsWith(`${DiffContentProvider.scheme}:/${toolCallId}/`)) {
        this.content.delete(key);
      }
    }
  }
}
