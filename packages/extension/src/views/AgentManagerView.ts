import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import type { AuthManager } from '../auth/AuthManager';
import type { HostToWebview, WebviewToHost } from '../shared/messages';

/**
 * Webview provider for the Agent Manager surface (Ctrl+E).
 *
 * Management only — roster, settings, session lifecycle. Structurally
 * separate from AgentPanelView (the chat surface) so the two stay isolated
 * per the product requirement, not just by convention. Roster wiring to
 * /api/agents lands in Phase 4; Phase 1 is shell-only.
 */
export class AgentManagerView implements vscode.WebviewViewProvider {
  static readonly viewId = 'xeref.agentManager';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly auth: AuthManager
  ) {}

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

    this.auth.onDidChangeAuth((state) => {
      this.post({ type: 'auth.state', state });
    });
  }

  reveal(): void {
    this.view?.show?.(true);
  }

  private post(message: HostToWebview): void {
    void this.view?.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewToHost): Promise<void> {
    if (message.type === 'webview.ready') {
      this.post({ type: 'auth.state', state: { connected: await this.auth.isConnected() } });
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
  <title>Xeref Agent Manager</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
