import * as vscode from 'vscode';
import { logError, logInfo, logDebug } from './logger';

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
  token?: string; // streaming token emitted by backend
  [k: string]: any;
}

function getBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration('approvalGuard');
  const fromCfg = cfg.get<string>('baseUrl');
  if (fromCfg) return fromCfg.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function buildMeta(justification: string) {
  // Minimal meta satisfying backend schema
  // origin.repo required; branch optional
  const repo = vscode.workspace.name || 'workspace';
  return {
    origin: { repo, branch: undefined },
    requester: { id: 'vscode-user', source: 'agent', display: 'VS Code User' },
    justification
  };
}

export async function createGuardRequest(p: CreateRequestParams): Promise<GuardResponse> {
  const base = getBaseUrl();
  const url = `${base}/api/guard/request`;
  const finalAction = p.action || 'demo_action';
  const body = {
    action: finalAction,
    params: p.params || {},
    meta: buildMeta(p.justification)
  };
  logInfo(`Creating approval request → ${url} (action=${finalAction})`);
  logDebug(`Payload: ${JSON.stringify(body)}`);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    const hint = networkHint(base);
    logError(`Network error creating request at ${url}`, err);
    throw new Error(`network_error: fetch failed – ${hint}`);
  }
  if (!resp.ok) {
    const text = await safeRead(resp);
    logError(`HTTP ${resp.status} creating request`, text);
    throw new Error(`http_error_${resp.status}: ${text}`);
  }
  let data: any;
  try {
    data = await resp.json();
  } catch (err) {
    logError('Failed to parse JSON response', err);
    throw new Error('invalid_json_response');
  }
  if (p.wait) {
    try {
      const waited = await waitForTerminalState(base, data.requestId, 30_000);
      return waited;
    } catch (e) {
      logDebug(`Wait for terminal state timed out or failed: ${e}`);
    }
  }
  return data;
}

async function waitForTerminalState(base: string, requestId: string, timeoutMs: number): Promise<GuardResponse> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const statusUrl = `${base}/api/guard/status?requestId=${encodeURIComponent(requestId)}`;
    let statusResp: Response;
    try {
      statusResp = await fetch(statusUrl);
    } catch (err) {
      logError(`Network error polling status for ${requestId}`, err);
      await delay(1200);
      continue;
    }
    if (!statusResp.ok) {
      const text = await safeRead(statusResp);
      logError(`Status poll HTTP ${statusResp.status}`, text);
      await delay(1200);
      continue;
    }
    let json: any;
    try { json = await statusResp.json(); } catch { json = {}; }
    if (json.status === 'approved' || json.status === 'denied' || json.status === 'expired') {
      return json;
    }
    await delay(1200);
  }
  throw new Error('wait_timeout');
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function safeRead(resp: Response): Promise<string> {
  try { return await resp.text(); } catch { return '<unreadable body>'; }
}

function networkHint(base: string): string {
  try {
    const u = new URL(base);
    return `unable to reach ${u.hostname}:${u.port || (u.protocol === 'https:' ? 443 : 80)} (server down? port mismatch? proxy/firewall?)`;
  } catch {
    return 'invalid baseUrl configuration';
  }
}
