import * as vscode from 'vscode';
import * as path from 'node:path';

/**
 * Executes approved tool calls against the user's local workspace.
 *
 * In-process via vscode.workspace.fs — not a spawned child process. VS Code
 * already sandboxes filesystem access per-workspace; routing a single
 * read through a separate stdio JSON-RPC process (packages/runtime) would
 * be plumbing with no functional gain. That package stays a stub, reserved
 * for when terminal/command execution genuinely needs an external process.
 */
export class RuntimeBridge {
  /**
   * Reads a workspace-relative file. Rejects absolute paths and `..`
   * traversal so a model-supplied path can't escape the open workspace.
   */
  async readFile(relativePath: string): Promise<string> {
    const uri = this.resolveUri(relativePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf-8');
  }

  /** Like readFile, but a missing file resolves to '' instead of throwing —
   * used to diff a propose_edit against a file that doesn't exist yet. */
  async readFileOrEmpty(relativePath: string): Promise<string> {
    try {
      return await this.readFile(relativePath);
    } catch (err) {
      if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
        return '';
      }
      throw err;
    }
  }

  /** Writes (creating or overwriting) a workspace-relative file via
   * WorkspaceEdit, so the write lands on VS Code's native undo stack. */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const uri = this.resolveUri(relativePath);
    const edit = new vscode.WorkspaceEdit();
    let exists = true;
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      exists = false;
    }
    if (exists) {
      edit.replace(uri, new vscode.Range(0, 0, Number.MAX_SAFE_INTEGER, 0), content);
    } else {
      edit.createFile(uri, { contents: Buffer.from(content, 'utf-8') });
    }
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error(`Failed to write ${relativePath}.`);
    }
  }

  /**
   * Resolves a workspace-relative path to a Uri. Rejects absolute paths and
   * `..` traversal so a model-supplied path can't escape the open workspace.
   */
  private resolveUri(relativePath: string): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error('No workspace folder is open.');
    }

    if (path.isAbsolute(relativePath)) {
      throw new Error(`Refusing to access an absolute path: ${relativePath}`);
    }

    const normalized = path.normalize(relativePath);
    if (normalized.split(path.sep).includes('..')) {
      throw new Error(`Refusing to access outside the workspace: ${relativePath}`);
    }

    return vscode.Uri.joinPath(folder.uri, normalized);
  }
}
