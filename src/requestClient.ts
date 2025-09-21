import * as vscode from 'vscode';

export interface CreateRequestParams {
  action?: string;
  params: Record<string, unknown>;
  justification: string;
  wait?: boolean;
}

interface GuardResponse {
  requestId: string;
  status: string;
  approvals?: any[];
  denies?: any[];
  createdAt?: string;
  updatedAt?: string;
  [k: string]: any;
}

function getBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration('approvalGuard');
  const fromCfg = cfg.get<string>('baseUrl');
  if (fromCfg) return fromCfg.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function createGuardRequest(p: CreateRequestParams): Promise<GuardResponse> {
  const base = getBaseUrl();
  const body = {
    action: p.action || 'demo_action',
    params: p.params || {},
    justification: p.justification
  };
  const resp = await fetch(`${base}/api/guard/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Request failed ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  if (p.wait) {
    try {
      const waited = await waitForTerminalState(base, data.requestId, 30_000);
      return waited;
    } catch {
      // fall through if wait fails
    }
  }
  return data;
}

async function waitForTerminalState(base: string, requestId: string, timeoutMs: number): Promise<GuardResponse> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await fetch(`${base}/api/guard/status?id=${encodeURIComponent(requestId)}`);
    if (!status.ok) throw new Error(`Status poll failed: ${status.status}`);
    const json = await status.json();
    if (json.status === 'approved' || json.status === 'denied' || json.status === 'expired') {
      return json;
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error('Timed out waiting for terminal status');
}
