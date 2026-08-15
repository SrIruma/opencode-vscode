# Contributing to opencode-vscode

Thanks for taking the time to contribute! Contributions of all kinds are
welcome: bug reports, feature requests, documentation, and code.

## Repository overview

- `src/extension.ts` — entry point: activate/deactivate, commands, status bar
  and `__internals` (test-only exports).
- `src/server.ts` — `ServerManager`: connects to an existing `opencode serve`
  or starts one in the workspace; SSE with reconnection.
- `src/sdkClient.ts` — typed wrapper around `@opencode-ai/sdk` (sessions,
  chat, revert, permissions, default model, diffs).
- `src/chatPanel.ts` — webview chat panel with streaming.
- `src/patch.ts` / `src/diffs.ts` — reverse-applying unified diffs and the
  virtual `opencode-diff` document provider for native diffs.
- `src/permissions.ts` — `permission.updated` events as VS Code notifications.
- `src/context.ts`, `src/protocol.ts`, `src/config.ts`, `src/logger.ts` —
  editor context, webview protocol, configuration, logging.
- `test/` — unit and integration tests (`node --test`), with
  `test/stub/vscode.mjs` stubbing the VS Code API and `scripts/test.mjs`
  bundling everything with esbuild before running.
- `media/` — webview assets (chat CSS/JS, icon).

## Development environment

- Node.js 20 (matches CI) and Yarn 4 via corepack. This project pins Yarn with
  the `packageManager` field in `package.json` (`yarn@4.18.0`), so just
  enable corepack (`corepack enable`) and use `yarn`, never `npm`.
- No global installs: dependencies live in `node_modules` (node-modules
  linker, see `.yarnrc.yml`).

```sh
yarn install          # reproducible install (checksums via yarn.lock)
yarn tsc --noEmit     # strict typecheck
yarn test             # bundles and runs the test suite (node --test)
yarn watch            # esbuild in watch mode
yarn package          # produce a .vsix (clean + build + vsce package)
```

Run the extension from the **Run and Debug** panel (F5) — a debug host
launches with the extension loaded; on Remote - WSL the extension host runs in
WSL so it can talk directly to the `opencode` server.

## Branching and commits

- Work on a feature branch named after the change (for example
  `feat/<something>`, `fix/<something>`, `docs/<something>`).
- Keep `main` always releasable: merge to `main` only through a pull request.
- Use [conventional commits](https://www.conventionalcommits.org/) and keep
  each commit atomic:

| Prefix  | When to use                          |
|---------|--------------------------------------|
| `feat:` | A new user-facing capability.        |
| `fix:`  | A bug fix.                           |
| `docs:` | Documentation-only changes.          |
| `test:` | Adding or updating tests.            |
| `chore:`| Tooling, build, or maintenance work. |

## Testing conventions

- The test suite is `node --test` (Node 20 native test runner). Tests live in
  `test/` and are bundled with esbuild by `scripts/test.mjs`, so extension-less
  imports (like the ESM-only SDK) resolve at runtime.
- `src/extension.ts` exposes `__internals` purely so integration tests can
  reach the extension's wiring without a real VS Code host.
- When you change code, add or update tests in the same commit, and run
  `yarn test` before pushing.
- CI (`.github/workflows/ci.yml`) gates merges on `yarn tsc --noEmit`,
  `yarn test`, `yarn build` and `yarn vsce package`.

## Context hygiene with repoctx

This repository uses [repoctx](https://github.com/SrIruma/repoctx) to keep
`AGENTS.md` honest:

- After touching `package.json` scripts or the module structure, regenerate the
  tables: `repoctx generate`.
- Before committing or opening a PR, run `repoctx audit --check` — it exits
  non-zero on rot (ghost commands, stale paths). It is also a CI guard
  (`.github/workflows/repoctx.yml`).
- The sections between the repoctx markers are written by the tool, never by
  hand. `generate` reflects the package manager detected from `package.json`
  (Yarn here), so the Commands table uses `yarn run ...`.

## Pull request checklist

- [ ] Branch cut from the current `main`.
- [ ] Conventional, atomic commits with a clear message.
- [ ] Tests added or updated for the change.
- [ ] `yarn tsc --noEmit`, `yarn test`, and `yarn build` all pass.
- [ ] `repoctx audit --check` passes (regenerate `AGENTS.md` if scripts or
      modules changed).
- [ ] README and CHANGELOG updated when user-facing behaviour changes.

## Versioning

opencode-vscode follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version lives in the `version` field of `package.json`; releases are cut
from a tag (`vX.Y.Z`) and published to the VS Code Marketplace by
`.github/workflows/release.yml` when the tag matches the version.

| Kind of change | Version bump |
|---|---|
| Breaking (extension contract, API changes) | Major (`X.0.0`) |
| New user-facing feature | Minor (`x.Y.0`) |
| Bug fix, documentation | Patch (`x.y.Z`) |

## Getting help

Open an issue for bugs and feature ideas, or ask questions in the discussions
tab of the repository.
