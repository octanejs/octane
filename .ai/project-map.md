# Octane project map for agents

Octane is a private pnpm monorepo for a TypeScript-first UI framework that keeps a React-shaped authoring/API model while compiling `.tsrx`/JSX ahead of time.

## Authoritative sources

Always prefer current source over summaries:

- `README.md` — positioning, quick start, `.tsrx` syntax, public examples.
- `AGENTS.md` and `.rulesync/rules/project.md` — shared agent rules. This repo uses RuleSync, so update `.rulesync/rules/` then run `pnpm rules:generate` when changing generated references.
- `packages/octane/src/runtime.ts` — client runtime: rendering, hooks, scheduler, events, refs, context, portals, Suspense/transitions, keyed reconciler.
- `packages/octane/src/runtime.server.ts` and `packages/octane/src/server/index.ts` — SSR and hydration-facing server runtime.
- `packages/octane/src/compiler/` — TSRX compiler and Vite/Volar integration.
- `packages/octane/src/index.ts` and `packages/octane/src/constants.ts` — public client API.
- `docs/react-parity-migration-plan.md` — React parity goals, intentional divergences, test migration strategy.
- `docs/react-library-compat-plan.md` — strategy for porting React ecosystem bindings into Octane packages.
- `vitest.config.js` — test projects, aliases, compiler/plugin exclusions.
- `package.json`, `pnpm-workspace.yaml` — workspace scripts and package layout.

## Workspace layout

- `packages/octane/` (`octane`) — core runtime, compiler, SSR, tests.
- `packages/vite-plugin-octane/` (`@octanejs/vite-plugin`) — optional metaframework/plugin surface.
- `packages/react-compat/` (`@octanejs/react-compat`) — React runtime compatibility: unmodified React packages run on Octane via `octane({ compat: [react()] })`.
- `packages/react-wrapper/` (`@octanejs/react-wrapper`) — the reverse bridge: mount Octane components inside a real React app.
- `packages/{zustand,query,motion,stylex,router,lexical,floating-ui,radix}/` — Octane-native ports/bindings for React ecosystem libraries (the performance option next to react-compat).
- `packages/octane-mcp-server/` (`@octanejs/mcp-server`) — MCP server: user-facing bridge/migration/SSR skills plus repo automation tools.
- `benchmarks/` — perf harnesses: news, js-framework, recursive-context, signal-favoring, dbmon.
- `examples/`, `playground/` — runnable apps and manual validation.
- `scripts/scaffold-react-port.mjs` — creates React test-port skeletons with in/out-of-scope triage.

## Validation commands

Prefer the smallest validation that covers the change:

```bash
pnpm test
pnpm typecheck
pnpm format:check
pnpm rules:generate
./node_modules/.bin/vitest run packages/octane/tests/<file>.test.ts --reporter=verbose
```

Run targeted package tests by project/file, e.g.:

```bash
./node_modules/.bin/vitest run packages/zustand/tests --project zustand
./node_modules/.bin/vitest run packages/octane/tests/differential/basic.test.ts --project octane
```

## Core invariants

- Octane is React-shaped, not React-cloned. Check documented intentional divergences before changing behavior.
- Hooks use compiler-injected call-site slots; conditional/loop hooks are valid.
- Events are native delegated DOM events, not React synthetic events.
- No controlled-input reassertion model; `value`/`checked` are attributes.
- Keyed reconciliation is LIS-based; final DOM and node identity matter more than matching React's move set.
- `class`/`className` compose clsx-style.
- No class components, StrictMode double invoke, Server Components, or React synthetic event layer.

## Changesets

Add a changeset for user-facing package changes. Skip for docs-only, tests-only, and internal tooling changes. While Octane is alpha `0.x`, use patch releases unless maintainers say otherwise.
