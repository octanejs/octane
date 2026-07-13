---
root: true
targets: ['*']
description: 'Octane project overview and development guidelines'
globs: ['**/*']
---

# Octane Project Guide for AI Agents

Octane is a fast, TypeScript-first UI framework by Dominic Gannaway — the successor
to Inferno. It gives you the React programming model (the same hook API, `memo`,
context, portals, Suspense, transitions) but compiles components ahead of time, so
most of React's runtime work is already done before the page loads. Components are
authored in `.tsrx`. Octane is alpha software: the runtime, compiler, and
SSR/hydration paths all work and have a large test suite, but APIs can still change.

## Start From Current Sources

Use the nearest live source rather than this summary when they disagree — trust the
code and READMEs:

- `README.md` — project overview, positioning, quick start, and `.tsrx` syntax
  examples (components, control flow, state/effects, conditional hooks).
- `packages/octane/src/runtime.ts` — the client runtime (rendering, hooks, the
  keyed reconciler, scheduler, events, context, Suspense). It is large and heavily
  commented; the comments are the design spec.
- `packages/octane/src/runtime.server.ts` + `packages/octane/src/server/index.ts` —
  SSR. The public surface is `renderToString` / `renderToStaticMarkup` /
  `renderToPipeableStream` / `renderToReadableStream` under `octane/server` and
  `prerender` under `octane/static`; buffered results are `{ html, css }`
  (see `docs/ssr.md`).
- `packages/octane/src/compiler/` — the TSRX→Octane compiler (exposed as
  `octane/compiler`, `octane/compiler/vite`, `octane/compiler/volar`).
- `packages/octane/src/index.ts` / `constants.ts` — the public client API surface.
- `docs/react-parity-migration-plan.md` — the React-behavior parity analysis, the
  tiered test-migration plan, and the list of **intentional divergences** from
  React. Read this before "fixing" something to match React.
- `vitest.config.js` — the test project and file globs.
- `package.json` — workspace scripts (`test`, `typecheck`, `format`,
  `format:check`, `rules:generate`, `changeset`, `bench`).

## RuleSync

This repository uses RuleSync as the single source of truth for shared AI agent
instructions. Edit `.rulesync/rules/` and regenerate — do **not** hand-edit the
generated files.

Generated targets:

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.cursor/rules/project.mdc`

After changing RuleSync content, run:

```bash
pnpm rules:generate
```

## Repo Map

This is a pnpm monorepo containing the core `octane` runtime+compiler, the
`@octanejs/vite-plugin` metaframework (plus its `@octanejs/adapter-vercel`
deploy adapter), the `@octanejs/mcp-server` MCP server, and the `@octanejs/*`
framework bindings. The current publishable-package list and counts are
generated from workspace manifests in `docs/packages.md`:

- `packages/octane/` (npm: `octane`) — the runtime **and** the compiler together.
  - `src/runtime.ts` — client runtime.
  - `src/runtime.server.ts`, `src/server/` — server runtime / SSR.
  - `src/compiler/` — the `.tsrx` compiler (`compile.js`, `vite.js`, `volar.js`).
  - `tests/` — the test suite (see Validation).
- `packages/vite-plugin-octane/` (npm: `@octanejs/vite-plugin`) — the optional
  metaframework plugin (routing, streaming dev SSR, hydration wiring, and the
  production build: `vite build` → static client assets + a self-contained SSR
  server bundle; preview with `octane-preview`); `packages/adapter-vercel`
  deploys it to Vercel (Build Output API).
- `packages/octane-mcp-server/` (npm: `@octanejs/mcp-server`) — an MCP server
  exposing octane docs/compile tooling to AI agents.
- `packages/{zustand,jotai,i18next,tanstack-query,motion,dnd-kit,stylex,tanstack-router,remix-router,tanstack-table,tanstack-virtual,lexical,floating-ui,radix,hook-form,base-ui,recharts,redux,testing-library,mdx}/`
  (npm: `@octanejs/*`) — framework bindings, each an octane port of a React
  library (state, data-fetching, animation, styling, routing, editor,
  positioning, UI primitives, forms, charts, internationalization, testing,
  MDX). Parity varies by
  package — some are behaviorally complete ports, others are explicitly
  partial or alpha. `docs/bindings-status.md` is the generated per-package
  status table (upstream version, supported surface, known divergences,
  SSR/hydration, last evidence check); it is sourced from each package's
  `status.json` and CI checks it stays current (`pnpm bindings:status` to
  regenerate after a scope change).

`benchmarks/`, `playground/`, and `scripts/` hold local examples, perf harnesses,
and tooling. Route a change to the package that owns the behavior; prefer editing
the runtime/compiler over patching tests or generated output.

## Authoring `.tsrx`

- A component is any function used at a `<F/>` site — NOT a special declaration. It
  renders whatever it returns: a JSX root, a primitive (coerced to text), `null`, or
  an array (a function may early-return non-JSX too). `@{ … }` is shorthand for
  returning JSX — `function f() @{ … }` desugars to `function f() { … return <jsx> }`
  — so setup (hooks, locals) can sit next to the output; the `@{ … }` scope ends with
  **exactly one** output node (a JSX element or fragment `<>…</>`). Both forms compile
  identically and any function can use either (`export function X() @{ <jsx/> }`,
  `function getX() { return <jsx/> }`).
- Dynamic text holes use a cast: `{expr as string}`. The cast is **optional when
  the expression is provably a string** — a string/template literal, a
  `+`-concatenation involving a string (e.g. `{'Count: ' + count}`), or a local
  `const`/param the compiler tracks back to a string; it's required otherwise. A
  bare `{expr}` that isn't provably a string is a renderable hole (component /
  element descriptor / coerced primitive).
- Events are **native, delegated** DOM events (`onClick`, `onInput`, `onSubmit`),
  not a synthetic event layer — behavior matches the platform. There is no
  synthetic `onChange`: `onInput` is the per-keystroke handler for text controls
  (native `change` fires on blur/commit).
- Template control flow uses directive blocks: `@if (c) { } @else { }`,
  `@for (const x of xs; key x.id) { } @empty { }`, `@switch (v) { @case (a) { } @default { } }`,
  and `@try { } @pending { } @catch (e) { }`. Plain JS control flow stays in setup.
- Refs are passed as props (React-19 style): `ref={cb}`, `ref={obj}`, or multi-ref
  `ref={[a, b]}`. There is no `forwardRef`.

## Intentional Divergences From React

Octane is React-shaped but deliberately differs in a few places. Do **not** "fix"
these toward React without checking `docs/react-parity-migration-plan.md`:

- **No rules of hooks — except plain JS loops.** Hooks are tracked by
  compiler-assigned call-site slot, so a hook may sit behind a condition or after
  an early return. A slot-keyed hook in a plain JS loop is a **compile error**
  (every iteration would share the one call-site slot — state/memo/effect entries
  would silently collide); loop with the keyed `@for` template directive or
  extract a child component — each item then renders in its own scope. `use()`
  and `useContext` are exempt (call-order / context-identity keyed, not
  slot-keyed).
- **Dependency arrays are compiler-inferred when omitted.** This applies to
  `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`,
  and `useImperativeHandle`. The compiler derives dependencies from lexical
  captures and omits proven-stable hook results (state setters/dispatchers,
  refs, state getters, and `useEffectEvent`). Explicit arrays retain React's
  exact behavior and are never rewritten; `null` explicitly means run or
  recompute after every render.
- **State hooks expose a compiler-driven current-state getter.** `useState` and
  `useReducer` have a stable third tuple member (`[state, update, getState]`) that
  reads the latest scheduled hook-cell value. The compiler emits its specialized
  runtime helper only when tuple index 2 can be observed; ordinary two-item
  destructures retain the existing allocation-free path. Escaped or ambiguous
  tuples conservatively receive the complete three-item shape.
- **Controlled `value`/`checked` with native events.** Controlled form components
  follow React's semantics exactly (2026-07-08) — the prop drives the DOM property
  and reasserts on every commit and after discrete events; `defaultValue`/
  `defaultChecked` are the uncontrolled escape hatch — but WITHOUT a synthetic
  layer: `onInput` drives text inputs per keystroke; there is no `onChange`
  normalization (native `change` fires on blur). Do not add a synthetic `onChange`.
- **Keyed reconciler is LIS-based** (minimal DOM moves), not React's
  `lastPlacedIndex`. The final DOM is identical; the set of physically-moved nodes
  can differ. Survivor node identity and final order ARE guaranteed (and tested).
- **Parallel `use()` — no suspense waterfalls.** The compiler (ON by default;
  `parallelUse: false` opts out) memoizes `use()` argument creations per call
  site, starts provably-independent ones together, suspends ONCE per stratum,
  and prefetches independent descendant fetch trees (`__warm` plans). React
  runs the same code as a serial waterfall — do not "fix" fetch-start timing,
  batch replay counts, or prefetch behavior toward React
  (docs/suspense-parallel-use-plan.md). True data dependencies stay sequential;
  unwrap order, hydration-seed order, and rejection routing match React.
- **`class` / `className` compose clsx-style.** Strings, numbers, arrays, objects,
  and nesting all compose into a class string (falsy drops out), at every apply site
  (client, spread, SVG, scoped `<style>`, SSR) via `normalizeClass`. React coerces an
  array `className` to `"a,b"`; Octane yields `"a b"`. A plain string is the fast path.
- **No class components, no Server Components, no StrictMode double-invoke.**
- Octane otherwise matches React's observable hook/effect/Suspense/transition
  semantics — including effect ordering (child-first on mount, parent-first cleanup
  on deletion) and `useId` stability across server/client hydration.

## Validation

Prefer the smallest behavioral validation that covers the change. After any file
change, always run the repository-wide `pnpm format:check` before handoff. Running
Prettier only on touched source files is not a substitute: generated baselines,
docs, and RuleSync outputs must pass the same formatting gate as CI.

```bash
pnpm test                 # full vitest run
pnpm typecheck            # tsgo --noEmit across all packages
pnpm format:check         # prettier
pnpm rules:generate       # regenerate AI rule files after editing .rulesync/
```

Run a single test file (faster while iterating):

```bash
./node_modules/.bin/vitest run packages/octane/tests/<file>.test.ts --reporter=verbose
```

The test suite (`packages/octane/tests/`) is organized as:

- top-level `*.test.ts` — feature/unit tests for runtime + compiler behavior.
- `conformance/` — ports of `facebook/react` behaviors; each `it` cites the source
  like `// Per ReactHooksWithNoopRenderer-test.js:1885`. Genuine Octane divergences
  are pinned with `it.fails(...)` + a `// GAP` note so the suite stays green and the
  test auto-flips when the runtime is fixed. `docs/parity-gaps.md` is the generated
  index of the executable pins (`pnpm parity:gaps`; checked in CI) — it, not the
  many historical `// GAP` comments, is the live parity backlog.
- `differential/` — the gold-standard parity proof: `_rig.ts` runs the SAME `.tsrx`
  fixture through both Octane and `@tsrx/react`, drives identical events, and
  asserts byte-equal `innerHTML` after each step. Note it compares only final HTML,
  so it cannot see DOM move patterns, effect timing, or focus.
- `hydration/` — server-render → `hydrateRoot()` adoption tests (including
  `prod-mode-hydrate.test.ts`, which compiles with EXPLICIT prod options).
- `_fixtures/` — shared `.tsrx` fixtures; helpers live in `tests/_helpers.ts`
  (`mount`, `act`, `flushEffects`, `createLog`) and `tests/conformance/_helpers/`.

Two regression layers beyond the octane project:

- **`octane-prod` vitest project** — re-runs the SAME octane test files with the
  plugin forced to `hmr: false` (production compile: no HMR wrapper, no dev LOC
  metadata, `Symbol("<hash>#<n>")` hook slots). Vitest otherwise compiles
  everything in serve mode, so without this the prod compile branch has no
  runtime coverage. Tests asserting DEV-ONLY warnings conditionalize on
  `process.env.OCTANE_TEST_COMPILE_MODE === 'prod'`.
- **`website/tests/ssr-hydration.e2e.test.ts`** — boots the REAL vite dev server
  and the production `octane-preview` server and drives every route in headless
  Chromium, failing on hydration-mismatch warnings or page errors. Skips itself
  (loudly) when Chromium isn't installed; CI installs it (ci.yml).

`scripts/scaffold-react-port.mjs` turns a React test file into a triaged port
skeleton (in-scope `it.todo`s + out-of-scope reasons).

## Changesets

Add a changeset for user-facing changes to `octane` or `@octanejs/vite-plugin`.
Skip changesets for docs-only, test-only, and internal tooling updates. While Octane
is `0.x` alpha, stay on the `patch` track.

```bash
pnpm changeset
```

## Practical Guidance For Agents

- Read the owning source + its tests for exact behavior; `runtime.ts` comments are
  the spec. Don't rely on a repo-wide summary for subtle reconciler/scheduler rules.
- When porting React behavior, follow the conformance convention (cite the source
  line; pin real divergences as `it.fails` with a `// GAP` note) rather than
  asserting Octane's current behavior as if it were the target.
- Keep `.tsrx` fixtures minimal and focused on the asserted behavior.
- Match nearby naming, file layout, and test style; keep documentation updates short
  and durable.
