import * as vscode from 'vscode';

export class StatusPanel {
  private panel: vscode.WebviewPanel;
  private lastHtml: string = '';
  private currentRequestId?: string;

  constructor() {
    this.panel = vscode.window.createWebviewPanel(
      'approvalGuardStatus',
      'Approval Guard Status',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    this.panel.webview.html = this.renderSkeleton();
    this.panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'initAck') {
        // reserved for future handshake
      }
    });
  }

  reveal() {
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  refreshFromResult(result: any) {
    this.currentRequestId = result.requestId;
    const html = this.renderStatus(result);
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.panel.webview.html = html;
    }
  }

  postLiveState(state: { requestId: string; status: string; approvers?: string[]; decidedAt?: string | null; }) {
    if (!this.currentRequestId || state.requestId !== this.currentRequestId) return;
    try {
      this.panel.webview.postMessage({ type: 'liveState', state });
    } catch {
      // ignore errors sending to disposed panel
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
<p>ID: <span class="code" id="reqId">${r.requestId}</span></p>
<p>Status: <span id="statusBadge" class="${badgeClass}">${status}</span></p>
<p>Action: <span class="code" id="actionVal">${r.action || ''}</span></p>
<p>Approvals: <span id="approvalsCount">${(r.approvals || []).length}</span> • Denies: <span id="deniesCount">${(r.denies || []).length}</span></p>
<p><small>Updated: <span id="updatedAt">${r.updatedAt || r.createdAt || ''}</span></small></p>
<script>
const vscode = acquireVsCodeApi();
window.addEventListener('message', ev => {
  const msg = ev.data;
  if (msg.type === 'liveState' && msg.state) {
    const s = msg.state;
    const badge = document.getElementById('statusBadge');
    if (badge) {
      badge.textContent = s.status;
      badge.className = 'badge ' + s.status;
    }
    if (Array.isArray(s.approvers)) {
      const a = document.getElementById('approvalsCount');
      if (a) a.textContent = String(s.approvers.length);
    }
    const upd = document.getElementById('updatedAt');
    if (upd) upd.textContent = s.decidedAt || new Date().toISOString();
  }
});
vscode.postMessage({ type: 'initAck' });
</script>
</body></html>`;
  }
}
