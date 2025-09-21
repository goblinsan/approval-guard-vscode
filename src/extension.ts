import * as vscode from 'vscode';
import { createGuardRequest } from './requestClient';
import { StatusPanel } from './ui/statusPanel';
import { LiveStreamManager } from './liveStream';

export interface ApprovalGuardAPI {
  requestApproval(input: {
    action?: string;
    params?: Record<string, unknown>;
    justification: string;
    wait?: boolean;
  }): Promise<any>;
  getVersion(): string;
}

let statusPanel: StatusPanel | undefined;
let streamManager: LiveStreamManager | undefined;
const requestTokens = new Map<string,string>(); // requestId -> token

function getBaseUrl(): string {
  const cfg = vscode.workspace.getConfiguration('approvalGuard');
  const fromCfg = cfg.get<string>('baseUrl');
  return (fromCfg || 'http://localhost:3000').replace(/\/$/, '');
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
  const createCmd = vscode.commands.registerCommand('approvalGuard.createRequest', async (maybeArgs?: any) => {
    try {
      let justification: string | undefined;
      let action: string | undefined;
      let params: Record<string, unknown> | undefined;
      let wait: boolean | undefined;
      if (maybeArgs && typeof maybeArgs === 'object') {
        justification = maybeArgs.justification;
        action = maybeArgs.action;
        params = maybeArgs.params;
        wait = maybeArgs.wait;
      }
      if (!justification) {
        justification = await vscode.window.showInputBox({
          prompt: 'Justification for this action (required)',
          ignoreFocusOut: true
        });
      }
      if (!justification) return; // user cancelled
      const defaultAction = vscode.workspace.getConfiguration('approvalGuard').get<string>('defaultAction');
      const result = await createGuardRequest({
        action: action || defaultAction || 'rerequest_demo',
        params: params || {},
        justification,
        wait: wait !== false // default true
      });
      if (result.token) {
        requestTokens.set(result.requestId, result.token);
        const mgr = ensureStreamManager();
        mgr.start(result.requestId, result.token);
      }
      if (!maybeArgs) {
        vscode.window.showInformationMessage(`Approval request ${result.requestId} status: ${result.status}`);
      }
      statusPanel?.refreshFromResult(result);
      return result;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Approval Guard error: ${e.message || e}`);
      if (maybeArgs) throw e;
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
      let justification: string | undefined;
      let wait: boolean | undefined;
      if (typeof args === 'string') {
        justification = args; // treat as justification only
      } else if (args && typeof args === 'object') {
        action = args.action;
        params = args.params;
        justification = args.justification;
        wait = args.wait;
      } else if (args == null) {
        throw new Error('missing_args: provide an object or justification string');
      }
      if (!justification || typeof justification !== 'string' || justification.length < 3) {
        throw new Error('invalid_justification');
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

  context.subscriptions.push(createCmd, panelCmd, argsCmd);

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
    getVersion: () => '0.0.1'
  };

  return api;
}

export function deactivate() { /* noop */ }
