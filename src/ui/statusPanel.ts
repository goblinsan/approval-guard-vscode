import * as vscode from 'vscode';

export class StatusPanel {
  private panel: vscode.WebviewPanel;
  private lastHtml: string = '';

  constructor() {
    this.panel = vscode.window.createWebviewPanel(
      'approvalGuardStatus',
      'Approval Guard Status',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    this.panel.webview.html = this.renderSkeleton();
  }

  reveal() {
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  refreshFromResult(result: any) {
    const html = this.renderStatus(result);
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.panel.webview.html = html;
    }
  }

  private renderSkeleton(): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0.75rem; }
.code { font-family: monospace; background: var(--vscode-editor-background); padding: 4px 6px; border-radius: 4px; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
.badge.approved { background: #2d8a34; color: #fff; }
.badge.denied { background: #a1260d; color: #fff; }
.badge.pending { background: #777; color: #fff; }
</style>
</head>
<body>
<h3>Approval Guard</h3>
<p>No request yet. Use the command palette: <span class="code">Approval Guard: Create Request</span></p>
</body>
</html>`;
  }

  private renderStatus(r: any): string {
    const status = r.status || 'unknown';
    const badgeClass = `badge ${status}`;
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0.75rem; }
.code { font-family: monospace; background: var(--vscode-editor-background); padding: 4px 6px; border-radius: 4px; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
.badge.approved { background: #2d8a34; color: #fff; }
.badge.denied { background: #a1260d; color: #fff; }
.badge.pending { background: #777; color: #fff; }
</style></head>
<body>
<h3>Approval Guard Request</h3>
<p>ID: <span class="code">${r.requestId}</span></p>
<p>Status: <span class="${badgeClass}">${status}</span></p>
<p>Action: <span class="code">${r.action || ''}</span></p>
<p>Approvals: ${(r.approvals || []).length} • Denies: ${(r.denies || []).length}</p>
<p><small>Updated: ${r.updatedAt || r.createdAt || ''}</small></p>
</body></html>`;
  }
}
