# OpenCode for VS Code

A native VS Code extension for [OpenCode](https://opencode.ai) — an open source
AI coding agent. It runs OpenCode as a **citizen of the editor** instead of a
terminal session: you get a chat panel, streaming responses, editor-aware
context, native diffs, and full access to the VS Code API.

Built for **WSL / Remote - WSL**: the extension runs inside the WSL extension
host, so it can spawn and talk to the `opencode` server directly — no
`wsl.exe`, no networking gymnastics, no opening the terminal every time. It
also runs natively on Windows (and any Linux host): the server binary is
resolved with the platform-specific extension and spawned with the workspace
folder as the working directory.

## Features

- **Chat panel** in a webview with live streaming (SSE) from the opencode server.
- **Session management**: create, switch, resume and stop sessions.
- **Editor context**: send the active file and selection to the agent with one
  command.
- **Native diffs**: review changes in VS Code's real diff editor via a virtual
  document provider.
- **Permissions as notifications**: approve/deny server permission requests
  without leaving the editor.
- **Server lifecycle managed for you**: connects to an existing `opencode serve`
  or starts one in the workspace.

## Requirements

- VS Code with the **Remote - WSL** extension (recommended), or any Linux host.
- `opencode` binary available on `PATH` (or configured via `opencode.server.binaryPath`).
- An LLM provider configured for opencode (e.g. `opencode auth login`).

## Usage

1. Install the extension.
2. Run **OpenCode: Open Chat** from the command palette (`Ctrl+Shift+P`) or
   click the status bar item.
3. Start typing. Select text in an editor and use **OpenCode: Send Selection**
   to give the agent context.
4. Use **OpenCode: Show Changes** to review what the agent changed in the
   native diff view.

### Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `opencode.server.port` | `4096` | Port for the opencode server. |
| `opencode.server.autoStart` | `true` | Start/connect the server on activation. |
| `opencode.server.binaryPath` | `opencode` | Path to the opencode binary. |
| `opencode.server.startArgs` | `[]` | Extra CLI args for `opencode serve`. |
| `opencode.chat.autoRevealPanel` | `true` | Reveal the chat panel on send. |

## Commands

| Command | Description |
| --- | --- |
| `OpenCode: Open Chat` | Open the chat panel. |
| `OpenCode: New Session` | Start a fresh session. |
| `OpenCode: Send Selection` | Send the current selection to chat. |
| `OpenCode: Reference Active File` | Reference the active file. |
| `OpenCode: Stop Session` | Abort the running session. |
| `OpenCode: Show Changes` | Open the diff of the current session. |
| `OpenCode: Reconnect Server` | Restart the connection to the server. |

## Development

```bash
yarn install
yarn watch    # build in watch mode
yarn package  # produce a .vsix
```

Run the extension from the Run and Debug panel (F5) — a debug host will launch
with the extension loaded.

### Keeping `AGENTS.md` truthful

This repository uses [repoctx](https://github.com/SrIruma/repoctx) to keep the
factual sections of `AGENTS.md` (commands, module structure) in sync with the
code:

```bash
repoctx generate   # regenerate the sections between the repoctx markers
repoctx audit      # detect ghost commands and stale paths (exit 0 = healthy)
```

A dedicated CI guard (`.github/workflows/repoctx.yml`) runs `repoctx
audit --check` on every push/PR and fails the build if the context file
drifts.

### Publishing to the VS Code Marketplace

Not published yet. To enable it:

1. Register a publisher id: `npx vsce create-publisher sriruma` (only once).
2. Create an Azure DevOps PAT with **Marketplace > Manage** scope and store it
   as the `VSCE_PAT` secret in the repository settings.
3. Tag a release (`git tag v0.2.0 && git push origin v0.2.0`): the release
   workflow publishes the extension to the Marketplace automatically. Without
   the `VSCE_PAT` secret the step is skipped and only the GitHub Release is
   created.

## How it works

OpenCode is client-server by design: the TUI is just a client of `opencode
serve`, which exposes a full HTTP API (OpenAPI 3.1) plus a server-sent events
stream. This extension is another client:

```
┌─ VS Code (extension host, WSL) ─┐
│  webview chat  ⇄  extension TS  │
│       │            │            │
│       └── SDK (@opencode-ai/sdk) │
└──────────────┬──────────────────┘
               │ HTTP/SSE
        ┌──────▼──────┐
        │ opencode serve │
        └───────────────┘
```

See https://opencode.ai/docs/server/ and https://opencode.ai/docs/sdk/ for the
underlying APIs.

## License

[MIT](LICENSE)
