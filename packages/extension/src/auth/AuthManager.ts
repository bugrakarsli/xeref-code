import * as vscode from 'vscode';
import type { AuthState } from '../shared/messages';
import { XerefApiError } from '../api/XerefClient';

const SECRET_KEY = 'xeref.mcpToken';

/**
 * Owns the Xeref bearer token (profiles.mcp_token, pasted from Xeref →
 * Settings → MCP Server Token). Stored in VS Code SecretStorage — never in
 * `configuration` (which would land in plaintext settings.json) and never
 * sent to a webview.
 *
 * Sign-in verifies a pasted token with the backend before storing it (see `signIn`); the plan
 * and limits come from AccountService, not from here.
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

  /**
   * Prompts the user to paste their Xeref MCP token and stores it.
   *
   * `verify` checks the token with the backend first. It should throw `XerefApiError` with status
   * 401 for a rejected token (nothing is stored); any other failure (offline, a server without
   * /api/code/account yet) stores the token anyway and says it could not be verified.
   */
  async signIn(verify?: (token: string) => Promise<unknown>): Promise<boolean> {
    const token = await vscode.window.showInputBox({
      title: 'Connect Xeref Account',
      prompt: 'Paste your Xeref MCP Server Token (Xeref → Settings → MCP Server Token)',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim().length === 0 ? 'Token cannot be empty' : undefined),
    });

    if (!token) {
      return false;
    }

    const trimmed = token.trim();
    let unverified = false;
    if (verify) {
      try {
        await verify(trimmed);
      } catch (err) {
        if (err instanceof XerefApiError && err.status === 401) {
          void vscode.window.showErrorMessage(
            'Xeref Code: that token was rejected. Copy it again from Xeref → Settings → MCP Server Token.'
          );
          return false;
        }
        unverified = true;
      }
    }

    await this.secrets.store(SECRET_KEY, trimmed);
    this._onDidChangeAuth.fire({ connected: true });
    void vscode.window.showInformationMessage(
      unverified ? 'Xeref Code: token saved, but it could not be verified right now.' : 'Xeref Code: connected.'
    );
    return true;
  }

  async signOut(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
    this._onDidChangeAuth.fire({ connected: false });
    void vscode.window.showInformationMessage('Xeref Code: disconnected.');
  }
}
