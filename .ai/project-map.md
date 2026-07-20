# Octane project map for agents

Octane is a private pnpm monorepo for a JavaScript UI framework that keeps a React-shaped authoring/API model while compiling `.tsrx`/JSX ahead of time.

## Authoritative sources

Always prefer current source over summaries:

- `README.md` — positioning, quick start, `.tsrx` syntax, public examples.
- `AGENTS.md` and `.rulesync/rules/project.md` — shared agent rules. This repo uses RuleSync, so update `.rulesync/rules/` then run `pnpm rules:generate` when changing generated references.
- `.rulesync/rules/core-engineering.md` — mandatory performance-first design,
  measurement, and adversarial self-review gates for framework fundamentals.
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
- The framework-binding rows in `docs/packages.md` — the generated inventory of Octane ports for React ecosystem libraries (parity varies; see `docs/bindings-status.md` and each package README).
- `packages/adapter-vercel/` (`@octanejs/adapter-vercel`) — Vercel deploy adapter for the vite-plugin build output.
- `packages/octane-mcp-server/` (`@octanejs/mcp-server`) — MCP server: user-facing bridge/migration/SSR skills plus repo automation tools.
- `packages/octane-devtools/` (`@octanejs/devtools`) — in-page devtools panel over the `octane/devtools` runtime bridge (live tree, hook state, performance, agent prompt export); dev-server opt-in via `octane({ devtools: true })`.
- `benchmarks/` — unified perf harnesses under `benchmarks/bench.mjs` (js-framework, dbmon, news, signal-favoring, recursive-context, async-waterfall, SSR/streaming, size suites, …).
- `website/` — the octanejs.dev app (docs, playground, benchmarks pages).
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
- Hooks use compiler-injected call-site slots; conditional and early-return hooks are valid. Slot-keyed hooks in plain JS loops are a compile error — use the keyed `@for` directive or a child component (`use()`/`useContext` are exempt).
- Events are native delegated DOM events, not React synthetic events. There is no synthetic `onChange` normalization: `onInput` is the per-edit handler; native `change` fires on commit/blur. `OCTANE_NATIVE_TEXT_ONCHANGE` reports likely React-style text-host wiring at compile time (or at development runtime for ambiguous final props). Keep genuine text commit behavior with `suppressNativeChangeWarning`; do not rewrite component callbacks, selects, or checkbox/radio handlers.
- Controlled `value`/`checked` match React (2026-07-08): the prop drives the DOM property and reasserts on every commit and after discrete events; `defaultValue`/`defaultChecked` are the uncontrolled escape hatch.
- Keyed reconciliation is LIS-based; final DOM and node identity matter more than matching React's move set.
- `class`/`className` compose clsx-style.
- No class components, StrictMode double invoke, Server Components, or React synthetic event layer.

## Changesets

Add a changeset for user-facing package changes. Skip for docs-only, tests-only, and internal tooling changes. While Octane is alpha `0.x`, use patch releases unless maintainers say otherwise.
