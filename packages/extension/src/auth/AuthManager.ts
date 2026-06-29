import * as vscode from 'vscode';
import type { AuthState } from '../shared/messages';

const SECRET_KEY = 'xeref.mcpToken';

/**
 * Owns the Xeref bearer token (profiles.mcp_token, pasted from Xeref →
 * Settings → MCP Server Token). Stored in VS Code SecretStorage — never in
 * `configuration` (which would land in plaintext settings.json) and never
 * sent to a webview.
 *
 * Phase 1 scope: store/retrieve/clear the token and expose a connection
 * event. Validating the token against the backend (`whoami`) and resolving
 * the user's plan lands in Phase 2 alongside XerefClient.
 */
export class AuthManager {
  private readonly _onDidChangeAuth = new vscode.EventEmitter<AuthState>();
  /** Fires whenever the connection state changes (sign in/out). */
  readonly onDidChangeAuth = this._onDidChangeAuth.event;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getToken(): Promise<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }

  async isConnected(): Promise<boolean> {
    return (await this.getToken()) !== undefined;
  }

  /** Prompts the user to paste their Xeref MCP token and stores it. */
  async signIn(): Promise<void> {
    const token = await vscode.window.showInputBox({
      title: 'Connect Xeref Account',
      prompt: 'Paste your Xeref MCP Server Token (Xeref → Settings → MCP Server Token)',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length === 0 ? 'Token cannot be empty' : undefined),
    });

    if (!token) {
      return;
    }

    await this.secrets.store(SECRET_KEY, token.trim());
    this._onDidChangeAuth.fire({ connected: true });
    void vscode.window.showInformationMessage('Xeref Code: connected.');
  }

  async signOut(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
    this._onDidChangeAuth.fire({ connected: false });
    void vscode.window.showInformationMessage('Xeref Code: disconnected.');
  }
}
