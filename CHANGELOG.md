# Change Log

All notable changes to this project will be documented in this file.
## [Unreleased]

### Added

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

### Added

- Initial extension scaffold with esbuild bundling, TypeScript strict mode and unit tests for the unified-diff reverse-applier.
