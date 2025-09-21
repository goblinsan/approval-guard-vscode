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
  const createCmd = vscode.commands.registerCommand('approvalGuard.createRequest', async () => {
    try {
      const justification = await vscode.window.showInputBox({
        prompt: 'Justification for this action (required)',
        ignoreFocusOut: true
      });
      if (!justification) return;
      const defaultAction = vscode.workspace.getConfiguration('approvalGuard').get<string>('defaultAction');
      const result = await createGuardRequest({
        action: defaultAction || 'rerequest_demo',
        params: {},
        justification,
        wait: true
      });
      vscode.window.showInformationMessage(
        `Approval request ${result.requestId} status: ${result.status}`
      );
      statusPanel?.refreshFromResult(result);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Approval Guard error: ${e.message || e}`);
    }
  });

  const panelCmd = vscode.commands.registerCommand('approvalGuard.openStatusPanel', () => {
    if (!statusPanel) statusPanel = new StatusPanel();
    statusPanel.reveal();
  });

  context.subscriptions.push(createCmd, panelCmd);

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
