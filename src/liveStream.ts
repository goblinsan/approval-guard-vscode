import * as vscode from 'vscode';
import { logDebug, logError, logInfo } from './logger';

interface SSEStateEvent {
  status: string;
  approvers?: string[];
  decidedAt?: string | null;
}

export interface LiveStateNormalized extends SSEStateEvent {
  requestId: string;
  action?: string;
  approvalsCount?: number;
  minApprovals?: number;
  // Additional fields can be merged later from polling if needed
}

export type StateListener = (s: LiveStateNormalized) => void;

interface ActiveStream {
  token: string;
  requestId: string;
  abort: AbortController;
  backoff: number;
  terminal: boolean;
}

/**
 * LiveStreamManager
 * Responsibility: Maintain a single SSE connection for a given request token with
 * reconnection strategy until terminal state is reached.
 * Non-goals: multiplexing multiple requests concurrently (can be extended later).
 */
export class LiveStreamManager {
  private active?: ActiveStream;
  private baseUrl: string;
  private listener?: StateListener;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  onState(listener: StateListener) { this.listener = listener; }

  start(requestId: string, token: string) {
    // Replace any existing stream
    this.stop();
    const abort = new AbortController();
    this.active = { token, requestId, abort, backoff: 1000, terminal: false };
    this.connect();
  }

  stop() {
    if (this.active) {
      this.active.abort.abort();
      this.active = undefined;
    }
  }

  private async connect() {
    if (!this.active) return;
    const { token, requestId, abort } = this.active;
    const url = `${this.baseUrl}/api/guard/wait-sse?token=${encodeURIComponent(token)}`;
    logInfo(`SSE connect → ${url}`);
    try {
      const resp = await fetch(url, { signal: abort.signal, headers: { 'Accept': 'text/event-stream' } });
      if (!resp.ok || !resp.body) throw new Error(`sse_http_${resp.status}`);
      const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
      let buffer = '';
      const textDecoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += textDecoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            this.processEvent(chunk, requestId);
          if (!this.active) return; // stopped mid-loop
          if (this.active.terminal) { this.stop(); return; }
        }
      }
      // Stream ended naturally - if not terminal, schedule reconnect
      if (this.active && !this.active.terminal) {
        logDebug('SSE stream ended (no terminal state) – scheduling reconnect');
        this.scheduleReconnect();
      }
    } catch (err) {
      logError('SSE connection error', err);
      if (this.active && !this.active.terminal && !this.active.abort.signal.aborted) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect() {
    if (!this.active) return;
    const delay = this.active.backoff;
    logDebug(`SSE reconnect in ${delay}ms (request ${this.active.requestId})`);
    this.active.backoff = Math.min(this.active.backoff * 2, 15000);
    setTimeout(() => this.connect(), delay);
  }

  private processEvent(rawBlock: string, requestId: string) {
    let eventType = 'message';
    const dataLines: string[] = [];
    for (const line of rawBlock.split(/\r?\n/)) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (eventType !== 'state') return; // ignore heartbeat or others
    const jsonStr = dataLines.join('\n');
    try {
      const parsed = JSON.parse(jsonStr) as SSEStateEvent;
      const normalized: LiveStateNormalized = { ...parsed, requestId };
      if (['approved','denied','expired'].includes(parsed.status)) {
        if (this.active) this.active.terminal = true;
      }
      this.listener?.(normalized);
    } catch (e) { logDebug(`Failed to parse SSE event chunk: ${e}`); }
  }
}
