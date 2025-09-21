import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getLogChannel(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel('Approval Guard');
  return channel;
}

export function logInfo(msg: string) {
  getLogChannel().appendLine(`[INFO ${new Date().toISOString()}] ${msg}`);
}

export function logError(msg: string, err?: unknown) {
  const detail = err instanceof Error ? (err.stack || err.message) : (err ? String(err) : '');
  getLogChannel().appendLine(`[ERROR ${new Date().toISOString()}] ${msg}${detail ? ' :: '+detail : ''}`);
}

export function logDebug(msg: string) {
  const cfg = vscode.workspace.getConfiguration('approvalGuard');
  if (cfg.get<boolean>('debugLogging')) {
    getLogChannel().appendLine(`[DEBUG ${new Date().toISOString()}] ${msg}`);
  }
}
