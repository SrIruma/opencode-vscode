# Change Log

All notable changes to this project will be documented in this file.
## [Unreleased]

### Added

- **Inline change highlights**: after *OpenCode: Show Changes*, the added and
  removed lines of each changed file are highlighted in the editor (green/red
  line background + overview ruler), complementing the native diff view. The
  highlights clear on manual edits, file close, or the new *OpenCode: Clear
  Change Highlights* command. Line computation is unit-tested
  (`computeChangedLines` in `src/patch.ts`).

- Community and governance docs: `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, issue and PR templates, `docs/donate.md` with a GitHub
  "Sponsor" button (BTC / USDT-TRC20) and README "Community"/"Support"
  sections.

### Changed

- Development moved from npm to **Yarn 4 (Berry)** via corepack
  (`packageManager: yarn@4.18.0`, node-modules linker). `yarn install
  --immutable` (checksum-verified) replaces `npm ci`; scripts run with
  `yarn <script>`. CI and release workflows use corepack + yarn, and the
  repoctx CI guard now uses repoctx v0.6.0, which detects the package manager
  and emits `yarn run ...` commands in `AGENTS.md`.
- **No Marketplace publishing.** The extension is not published to the VS Code
  Marketplace; distribution happens through GitHub Releases only. The release
  workflow now just builds, tests and attaches the `.vsix` to the tag, the
  `publish` script was dropped and the `clean` script no longer relies on a
  shell glob that breaks under zsh (`find` + `-delete` instead).
- CI/release workflows bumped to `actions/checkout@v5` and
  `actions/upload-artifact@v5` (node24 runtime).

### Added

- Initial extension scaffold with esbuild bundling, TypeScript strict mode and unit tests for the unified-diff reverse-applier.
