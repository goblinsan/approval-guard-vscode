# Approval Guard VS Code Extension

Lightweight client for interacting with an Approval Guard service from inside VS Code.

## Features (Initial Scaffold)
- Command: `Approval Guard: Create Request` – prompts for a justification in interactive mode OR accepts an argument object (see Non-Interactive section) to run silently.
- Command: `Approval Guard: Open Status Panel` – opens a simple webview panel that shows the most recent request's status.
- Command: `Approval Guard: Create Request (Args)` – programmatic/agent oriented; accepts an argument object directly (no prompt) and returns the request result.
- Programmatic API (other extensions can depend): exposes `requestApproval` and `getVersion` via `exports` from `activate`.

## Configuration
| Setting | Default | Description |
|---------|---------|-------------|
| `approvalGuard.baseUrl` | `http://localhost:8080` | Base URL of the Approval Guard HTTP service. Should point at the server root (no trailing slash). |
| `approvalGuard.defaultAction` | `rerequest_demo` | Default action value used when none specified in the create command/API. |

## Usage
1. Ensure the Approval Guard backend is running locally (defaults shown below) or configure `approvalGuard.baseUrl`.
2. Open the command palette (`Ctrl/Cmd+Shift+P`) and run `Approval Guard: Create Request`.
3. Enter a justification (if not supplied programmatically). The extension will POST to `/api/guard/request` and (by default) poll `/api/guard/status?requestId=...` until terminal state.
4. Open `Approval Guard: Open Status Panel` to view the last request rendered in a webview.

## Non-Interactive Invocation of Main Command
You can bypass the input prompt by passing an argument object when executing the primary command:
```ts
await vscode.commands.executeCommand('approvalGuard.createRequest', {
  action: 'scale_out',
  params: { delta: 2 },
  justification: 'Scale out for baseline load increase',
  wait: true
});
```
This is equivalent to using `approvalGuard.createRequestArgs`.

## Agent / Copilot Usage
There are two main ways for an agent to invoke an approval request:

### 1. Invoke Args Command (or pass args to main command)
```ts
const result = await vscode.commands.executeCommand('approvalGuard.createRequestArgs', {
  action: 'deploy_service',
  params: { version: '1.2.3' },
  justification: 'Deploying critical patch',
  wait: true
});
```
(or use `'approvalGuard.createRequest'` with the same argument object.)

Returned object includes at least: `requestId`, `status`, optionally `expiresAt`, `policy` hints.

### 2. Use the Exported API
```ts
const api = vscode.extensions.getExtension('your-publisher.approval-guard')?.exports as import('./dist/extension').ApprovalGuardAPI;
const result = await api.requestApproval({
  action: 'deploy_service',
  params: { version: '1.2.3' },
  justification: 'Deploying critical patch',
  wait: true
});
```

### Command Argument Schema
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | No | Defaults to `approvalGuard.defaultAction` or `rerequest_demo`. |
| `params` | object | No | Arbitrary key/value pairs. |
| `justification` | string | Yes | At least 3 characters. |
| `wait` | boolean | No | Defaults to true (waits for terminal state or until internal timeout). |

### Error Handling
Errors throw with messages like `invalid_justification` or backend `invalid_payload` details.

## Endpoints Used
- `POST /api/guard/request`
- `GET /api/guard/status?requestId=<id>`

## Programmatic API Summary
```ts
interface ApprovalGuardAPI {
  requestApproval(input: { action?: string; params?: Record<string,unknown>; justification: string; wait?: boolean }): Promise<any>;
  getVersion(): string;
}
```

## Language Model Tool Integration (#approval)

The extension now exposes a lightweight Language Model Tool descriptor (experimental) so prompting systems that scan `exports.tools` can auto-discover an `approval` tool. This enables prompt hints like `#approval` to nudge selection.

Tool metadata:
```jsonc
{
  "toolReferenceName": "approval",
  "name": "Approval Guard Request",
  "description": "Create an approval request. Provide justification and optional action/params.",
  "inputSchema": {
    "type": "object",
    "required": ["justification"],
    "properties": {
      "justification": { "type": "string" },
      "action": { "type": "string" },
      "params": { "type": "object" },
      "wait": { "type": "boolean" }
    }
  }
}
```

### Example Prompt Snippets
```
Please request deployment approval for version 2.4.1 #approval
```

Underlying tool call (conceptual):
```json
{
  "tool": "approval",
  "input": {
    "action": "deploy_service",
    "params": { "version": "2.4.1" },
    "justification": "Roll out security patch",
    "wait": true
  }
}
```

If the orchestrator doesn’t auto-detect tools, it can still call:
```ts
const api = vscode.extensions.getExtension('your-publisher.approval-guard')!.exports;
await api.tools.find(t => t.toolReferenceName === 'approval').run({
  action: 'scale_out',
  params: { delta: 3 },
  justification: 'Traffic spike mitigation',
  wait: true
});
```

### Notes
* `wait` defaults to true if omitted.
* Streaming updates (SSE) still appear in the status panel automatically.
* Future: tool may emit intermediate events when multi-step flows (personas) are enabled.

## Roadmap (Next Iterations)
- Live streaming updates via SSE endpoint (`/api/guard/wait-sse`).
- Tree view of active & pending requests.
- Multi-request history and persistence across reloads.
- Inline approve/deny (if/when safe token exposure path exists).
- Metrics summary view.

## Development
```bash
npm install
npm run watch # compile in watch mode
```
Press `F5` in VS Code to launch the extension host.

## Packaging
```bash
npm run package
```
Produces a `.vsix` you can install via the Extensions view.

## Contributing
Keep dependencies minimal. Add tests as logic grows. Avoid embedding secrets in settings; rely on backend configuration.

## License
Apache-2.0
