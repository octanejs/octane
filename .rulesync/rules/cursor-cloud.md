---
targets: ['*']
description: 'Cursor Cloud VM setup: Node PATH, targeted test/typecheck, example dev servers'
globs:
  - '.cursor/**'
  - '.cursor/environment.json'
---

# Cursor Cloud specific instructions

These notes apply on a Cursor Cloud VM. Local machines can ignore them.

- Node: the Cloud VM's default `node` is v22.14.0 (`/exec-daemon/node`), which is
  below this repo's `engines` floor of `>=22.22.2` and only produces install
  warnings, not errors. nvm already has the matching v22.22.2 installed, but
  `nvm use 22.22.2` is not enough because `/exec-daemon` precedes nvm on `PATH`.
  Prepend the nvm bin explicitly in each shell before running toolchain commands:
  `export PATH="/home/ubuntu/.nvm/versions/node/v22.22.2/bin:$PATH"`.
- `pnpm test` is the full suite (3,900+ tests, each also rerun through the
  `octane-prod` compiler path) and is very heavy. Prefer targeted runs while
  iterating: `./node_modules/.bin/vitest run <file.test.ts> --reporter=dot`.
- Typecheck is per-project; the fast native `tsgo` (`@typescript/native-preview`)
  drives it, e.g. `./node_modules/.bin/tsgo --noEmit -p packages/octane/tsconfig.json`.
  Programs containing `.tsrx` must use `tsrx-tsc --noEmit`, never plain `tsc`.
- Run an app in dev with `pnpm --filter <pkg> dev`. `draftboard-example`
  (port 5228) and `octane-playground` are client-only and need no network.
  `hacker-news-example` dev (`node server.mjs tsrx`) fetches the live Hacker News
  API, so it depends on network egress.
- `pnpm format:check` is repo-wide Prettier and takes ~2 min; prefer
  `pnpm format:files [path...]` (writes) / `pnpm format:files:check [path...]`
  scoped to your diff. Markdown is excluded from Prettier.
