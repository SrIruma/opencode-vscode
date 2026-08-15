---
name: Pull request
about: Propose a change to opencode-vscode
title: ""
labels: ""
assignees: ""
---

## What

A short summary of what this PR does.

## Why

The problem or context this change addresses.

## How to test

- Commands to run and expected output (e.g. `yarn tsc --noEmit`, `yarn test`,
  `yarn build`).
- Manual scenario in the extension host (F5) if user-facing.

## Checklist

- [ ] Branch cut from the current `main`.
- [ ] Conventional, atomic commits with a clear message.
- [ ] Tests added or updated for the change.
- [ ] `yarn tsc --noEmit`, `yarn test`, and `yarn build` all pass.
- [ ] `repoctx audit --check` passes (regenerate `AGENTS.md` if scripts or
      modules changed).
- [ ] README and CHANGELOG updated when user-facing behaviour changes.

## Related

- Issues or PRs this closes or relates to (e.g. `Fixes #123`).
