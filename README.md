# Approval Guard VS Code Extension

Lightweight client for interacting with an Approval Guard service from inside VS Code.

## Features (Initial Scaffold)
- Command: `Approval Guard: Create Request` – prompts for a justification, creates a request against the configured service, optionally waits for a terminal status, then surfaces the result.
- Command: `Approval Guard: Open Status Panel` – opens a simple webview panel that shows the most recent request's status.
- Programmatic API (other extensions can depend): exposes `requestApproval` and `getVersion` via `exports` from `activate`.

## Configuration
| Setting | Default | Description |
|---------|---------|-------------|
| `approvalGuard.baseUrl` | `http://localhost:8080` | Base URL of the Approval Guard HTTP service. Should point at the server root (no trailing slash). |
| `approvalGuard.defaultAction` | `rerequest_demo` | Default action value used when none specified in the create command/API. |

## Usage
1. Ensure the Approval Guard backend is running locally (defaults shown below) or configure `approvalGuard.baseUrl`.
2. Open the command palette (`Ctrl/Cmd+Shift+P`) and run `Approval Guard: Create Request`.
3. Enter a justification. The extension will POST to `/api/guard/request` and (by default) poll `/api/guard/status?id=...` until the request enters a terminal state (`approved`, `denied`, or `expired`).
4. Open `Approval Guard: Open Status Panel` to view the last request rendered in a webview.

## Endpoints Used
- `POST /api/guard/request` – creates a new approval request.
- `GET /api/guard/status?id=<requestId>` – polls current status (used when waiting and in future updates to the panel).

## Programmatic API
Another extension can depend on this one and call:
```ts
const api = vscode.extensions.getExtension('your-publisher.approval-guard')?.exports as ApprovalGuardAPI;
const result = await api.requestApproval({ justification: 'Need to deploy', action: 'deploy_service' });
```
Returned object mirrors backend JSON response (at minimum contains `requestId` and `status`).

## Roadmap (Next Iterations)
- Live streaming updates via SSE endpoint (`/api/guard/wait-sse`).
- Tree view of active & pending requests.
- Multi-request history and persistence across reloads.
- Inline approve/deny (if/when auth tokens & persona flows are exposed safely to the client).
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
Produces a `.vsix` file you can install via the Extensions view (three-dot menu > Install from VSIX...).

## Contributing
Keep dependencies minimal (TypeScript only for now). Add tests as logic grows (e.g., HTTP client retry / parsing). Avoid embedding secrets in settings; prefer environment variables managed by the backend service.

## License
MIT
