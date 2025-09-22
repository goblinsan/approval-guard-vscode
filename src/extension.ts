import * as vscode from 'vscode';
import { createGuardRequest } from './requestClient';
import { StatusPanel } from './ui/statusPanel';
import { LiveStreamManager } from './liveStream';
import { logInfo, logError } from './logger';

export interface ApprovalGuardAPI {
  requestApproval(input: {
    action?: string;
    params?: Record<string, unknown>;
    justification: string;
    wait?: boolean;
  }): Promise<any>;
  getVersion(): string;
  tools?: Array<{
    toolReferenceName: string;
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    run: (input: any) => Promise<any>;
  }>;
}

let statusPanel: StatusPanel | undefined;
let streamManager: LiveStreamManager | undefined;
const requestTokens = new Map<string,string>(); // requestId -> token

function getBaseUrl(): string { // unify base URL logic
  const cfg = vscode.workspace.getConfiguration('approvalGuard');
  const fromCfg = cfg.get<string>('baseUrl');
  return (fromCfg || 'http://localhost:8080').replace(/\/$/, '');
}

function firstJustification(obj: any): string | undefined {
  if (obj == null) return undefined;
  if (typeof obj === 'string') {
    const t = obj.trim();
    return t.length >= 3 ? t : undefined;
  }
  if (typeof obj !== 'object') return undefined;
  const aliasSet = new Set(['justification','reason','rationale','explanation','message','why','reasoning']);
  for (const [k, v] of Object.entries(obj)) {
    if (aliasSet.has(k.toLowerCase()) && typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 3) return t;
    }
  }
  return undefined;
}

function slug(source: string): string {
  return source.toLowerCase()
    .replace(/[^a-z0-9\s_-]/g,'')
    .trim()
    .split(/\s+/)
    .slice(0,5)
    .join('_')
    .slice(0,40);
}

function ensureStreamManager(): LiveStreamManager {
  if (!streamManager) {
    streamManager = new LiveStreamManager(getBaseUrl());
    streamManager.onState(ev => {
      if (!statusPanel) return;
      statusPanel.postLiveState(ev);
      if (['approved','denied','expired'].includes(ev.status)) {
        // terminal -> stop
        streamManager?.stop();
      }
    });
  }
  return streamManager;
}

export function activate(context: vscode.ExtensionContext): ApprovalGuardAPI {
  const effectiveBase = getBaseUrl();
  logInfo(`Approval Guard extension activated (baseUrl=${effectiveBase})`);
  const createCmd = vscode.commands.registerCommand('approvalGuard.createRequest', async (maybeArgs?: any) => {
    try {
      let action: string | undefined;
      let params: any = {};
      let wait: any;
      let scope: string | undefined;
      let justification: string | undefined;
      if (typeof maybeArgs === 'string') {
        justification = firstJustification(maybeArgs);
      } else if (maybeArgs && typeof maybeArgs === 'object') {
        ({ action, params, wait, scope } = maybeArgs as any);
        justification = firstJustification(maybeArgs);
      } else {
        throw new Error('justification_required: provide justification string or object with one of justification|reason|rationale|explanation|message|why');
      }
      if (!justification) {
        const keys = typeof maybeArgs === 'object' ? Object.keys(maybeArgs).join(',') : typeof maybeArgs;
        logError('Approval Guard missing justification in createRequest', new Error(keys));
        throw new Error(`justification_required: received keys/type: ${keys}`);
      }
      const cfg = vscode.workspace.getConfiguration('approvalGuard');
      const disableAuto = cfg.get<boolean>('disableAutoAction');
      if (!action && typeof scope === 'string' && scope.trim()) {
        action = `scope_${slug(scope.trim())}`;
      }
      if (!action) {
        if (disableAuto) {
          throw new Error('action_required: auto-derivation disabled (set approvalGuard.disableAutoAction=false or provide action/scope)');
        }
        action = `auto_${slug(justification)}`;
      }
      const defaultAction = vscode.workspace.getConfiguration('approvalGuard').get<string>('defaultAction');
      const result = await createGuardRequest({
        action: action || defaultAction || 'rerequest_demo',
        params: params || {},
        justification,
        wait: wait !== false
      });
      if (result.token) {
        requestTokens.set(result.requestId, result.token);
        const mgr = ensureStreamManager();
        mgr.start(result.requestId, result.token);
      }
      statusPanel?.refreshFromResult(result);
      return result;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Approval Guard error: ${e.message || e}`);
      throw e;
    }
  });

  const panelCmd = vscode.commands.registerCommand('approvalGuard.openStatusPanel', () => {
    if (!statusPanel) statusPanel = new StatusPanel();
    statusPanel.reveal();
  });

  const argsCmd = vscode.commands.registerCommand('approvalGuard.createRequestArgs', async (args: any) => {
    try {
      let action: string | undefined;
      let params: Record<string, unknown> | undefined;
      let wait: boolean | undefined;
      let scope: string | undefined;
      let justification: string | undefined;
      if (typeof args === 'string') {
        justification = args; // treat as justification only
      } else if (args && typeof args === 'object') {
        action = args.action;
        params = args.params;
        wait = args.wait;
        scope = args.scope;
        justification = firstJustification(args);
      } else if (args == null) {
        throw new Error('missing_args: provide an object or justification string');
      }
      if (!justification || typeof justification !== 'string' || justification.length < 3) {
        logError('Approval Guard invalid or missing justification in createRequestArgs', new Error(JSON.stringify(Object.keys(args || {}))));
        throw new Error('invalid_justification');
      }
      const cfg2 = vscode.workspace.getConfiguration('approvalGuard');
      const disableAuto2 = cfg2.get<boolean>('disableAutoAction');
      if (!action && typeof scope === 'string' && scope.trim()) {
        action = `scope_${slug(scope.trim())}`;
      }
      if (!action) {
        if (disableAuto2) {
          throw new Error('action_required: auto-derivation disabled (set approvalGuard.disableAutoAction=false or provide action/scope)');
        }
        action = `auto_${slug(justification)}`;
      }
      const result = await createGuardRequest({
        action: action || vscode.workspace.getConfiguration('approvalGuard').get<string>('defaultAction') || 'rerequest_demo',
        params: params || {},
        justification,
        wait: wait !== false
      });
      if (result.token) {
        requestTokens.set(result.requestId, result.token);
        const mgr = ensureStreamManager();
        mgr.start(result.requestId, result.token);
      }
      statusPanel?.refreshFromResult(result);
      return result;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Approval Guard error: ${e.message || e}`);
      throw e;
    }
  });

  const testCmd = vscode.commands.registerCommand('approvalGuard.testConnection', async () => {
    const base = getBaseUrl();
    const url = `${base}/api/guard/status?requestId=invalid-test`;
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok || resp.status === 400 || resp.status === 404) {
        logInfo(`Connectivity OK → ${base} (status ${resp.status})`);
        vscode.window.showInformationMessage(`Approval Guard connectivity OK (${resp.status}).`);
      } else {
        const body = await resp.text();
        logError(`Unexpected status ${resp.status} hitting test endpoint`, body);
        vscode.window.showErrorMessage(`Approval Guard test got HTTP ${resp.status}`);
      }
    } catch (err) {
      logError('Connectivity test failed', err);
      vscode.window.showErrorMessage(`Approval Guard connectivity failed: ${(err as any).message || err}`);
    }
  });

  context.subscriptions.push(createCmd, panelCmd, argsCmd, testCmd);

  const api: ApprovalGuardAPI = {
    requestApproval: async (input) => {
      const result = await createGuardRequest({
        action: input.action,
        params: input.params || {},
        justification: input.justification,
        wait: input.wait !== false
      });
      if (result.token) {
        requestTokens.set(result.requestId, result.token);
        const mgr = ensureStreamManager();
        mgr.start(result.requestId, result.token);
      }
      return result;
    },
    getVersion: () => '0.0.1',
    tools: [
      {
        toolReferenceName: 'approval',
        name: 'Approval Guard Request',
        description: 'Create an approval request. Provide justification and optional action/params. Returns requestId and initial status.',
        inputSchema: {
          type: 'object',
          required: ['justification'],
          properties: {
            justification: { type: 'string', description: 'Why the action is needed.' },
            action: { type: 'string', description: 'Action identifier.' },
            params: { type: 'object', description: 'Structured parameters for the action.' },
            wait: { type: 'boolean', description: 'If true (default), waits briefly for terminal state.' }
          }
        },
        run: async (input: any) => {
          const justification = firstJustification(input);
          if (!justification) {
            logError('Approval Guard missing justification in tool run (approval)', new Error(JSON.stringify(Object.keys(input || {}))));
            throw new Error(`justification_required: received keys: ${Object.keys(input || {}).join(',')}`);
          }
          let act = input.action;
          const cfg3 = vscode.workspace.getConfiguration('approvalGuard');
          const disableAuto3 = cfg3.get<boolean>('disableAutoAction');
          if (!act && typeof input.scope === 'string' && input.scope.trim()) {
            act = `scope_${slug(input.scope.trim())}`;
          }
          if (!act) {
            if (disableAuto3) {
              throw new Error('action_required: auto-derivation disabled (set approvalGuard.disableAutoAction=false or provide action/scope)');
            }
            act = `auto_${slug(justification)}`;
          }
          return api.requestApproval({
            action: act,
            params: input.params || {},
            justification,
            wait: input.wait
          });
        }
      }
    ]
  };

  const statusTool = {
    toolReferenceName: 'approvalStatus',
    name: 'Approval Guard Status',
    description: 'Retrieve current status for an approval request by requestId.',
    inputSchema: {
      type: 'object',
      required: ['requestId'],
      properties: {
        requestId: { type: 'string', description: 'The approval request identifier.' }
      }
    },
    run: async (input: any) => {
      if (!input || typeof input.requestId !== 'string') {
        throw new Error('requestId_required');
      }
      const base = getBaseUrl();
      const resp = await fetch(`${base}/api/guard/status?requestId=${encodeURIComponent(input.requestId)}`);
      if (!resp.ok) {
        throw new Error(`status_http_${resp.status}`);
      }
      return resp.json();
    }
  };

  if (api.tools) {
    api.tools.push(statusTool as any);
  }

  return api;
}

export function deactivate() { /* noop */ }
