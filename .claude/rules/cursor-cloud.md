---
paths:
  - .cursor/**
  - .cursor/environment.json
---
# Cursor Cloud specific instructions

These notes apply on a Cursor Cloud VM. Local machines can ignore them.

- Node: the Cloud VM's default `node` is v22.14.0 (`/exec-daemon/node`), which is
  below this repo's `engines` floor of `>=22.22.2` and only produces install
  warnings, not errors. nvm already has the matching v22.22.2 installed, but
  `nvm use 22.22.2` is not enough because `/exec-daemon` precedes nvm on `PATH`.
  Prepend the nvm bin explicitly in each shell before running toolchain commands:
  `export PATH="/home/ubuntu/.nvm/versions/node/v22.22.2/bin:$PATH"`.
- Bun: install the release pinned in root `package.json` `packageManager` with
  `curl -fsSL https://bun.sh/install | bash -s bun-v<version>`, then run
  `bun install --frozen-lockfile`.
- `bun run test` is the full suite (3,900+ tests, each also rerun through the
  `octane-prod` compiler path) and is very heavy. Prefer targeted runs while
  iterating: `./node_modules/.bin/vitest run <file.test.ts> --reporter=dot`.
- Typecheck is per-project through `octane-tsc` (TypeScript 7 with the tsrx
  content mapper), e.g. `./node_modules/.bin/octane-tsc -p packages/octane/tsconfig.json`.
  Never use plain `tsc` for a program containing `.tsrx`.
- Run an app in dev with `bun run --filter <pkg> dev`. `draftboard-example`
  (port 5228) and `octane-playground` are client-only and need no network.
  `hacker-news-example` dev (`node server.mjs tsrx`) fetches the live Hacker News
  API, so it depends on network egress.
- `bun run format:check` is repo-wide Prettier and takes ~2 min; prefer
  `bun run format:files [path...]` (writes) / `bun run format:files:check [path...]`
  scoped to your diff. Markdown is excluded from Prettier.
