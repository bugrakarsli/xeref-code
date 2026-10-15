import * as vscode from 'vscode';

/**
 * Opens a site-relative path (for example `/pricing`) on the configured Xeref endpoint in the
 * browser. Webviews can only ask for a path; absolute URLs, protocol-relative URLs and
 * backslashes are refused so a webview can never send the user to another origin.
 */
export async function openSitePath(endpoint: string, path: string): Promise<boolean> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false;
  return vscode.env.openExternal(vscode.Uri.parse(`${endpoint}${path}`));
}
