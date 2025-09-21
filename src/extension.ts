import * as vscode from 'vscode';
import { createGuardRequest } from './requestClient';
import { StatusPanel } from './ui/statusPanel';

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
      statusPanel?.refreshFromResult(result);
      return result;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Approval Guard error: ${e.message || e}`);
      throw e;
    }
  });

  context.subscriptions.push(createCmd, panelCmd, argsCmd);

  const api: ApprovalGuardAPI = {
    requestApproval: (input) =>
      createGuardRequest({
        action: input.action,
        params: input.params || {},
        justification: input.justification,
        wait: input.wait !== false
      }),
    getVersion: () => '0.0.1'
  };

  return api;
}

export function deactivate() { /* noop */ }
