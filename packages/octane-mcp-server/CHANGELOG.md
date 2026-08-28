# @octanejs/mcp-server

## 0.2.22

### Patch Changes

- 8adc693: Expose the scoped signals and native reads benchmark suites through the benchmark tool schema.

## 0.2.21

### Patch Changes

- bba4cd0: Cache small complete CSS results while mapping routes through a shared Vite
  manifest graph. Expose the accompanying client-asset benchmark through the
  Octane MCP benchmark tool.
- 3ca30fc: Cache configured root membership and the sorted language-service root list in TypeScript-backed text inference so repeated warm snapshots no longer scale with unrelated project roots, and expose the regression benchmark through the MCP benchmark runner.
- 37a8ca1: Expose the conditional JSX return compiler benchmark through the MCP benchmark
  runner.
- 922df8c: Skip manifest-cache scans for ordinary watched source changes while preserving package-manifest, full-reset, and diagnostic invalidation behavior. Expose the accompanying manifest-cache invalidation benchmark through the Octane MCP benchmark tool.
- 9dda682: Match static application routes without regular expressions and normalize each
  request method once per dispatch. Expose the accompanying router benchmark
  through the Octane MCP benchmark tool.
- 8a8afd8: Cache shared ancestry while ordering batched component updates so deeply nested render waves do not repeatedly walk the same parent chains.

  Expose the scheduler-depth benchmark through the Octane MCP benchmark tool.

- a014043: Expose the UIbench benchmark suite through the Octane MCP benchmark tool.
- 4a4996e: Treat `"use strong"` as an author assertion that every user-authored render call
  is a pure projection of immutable snapshots and witnessed inputs. Condition
  local, dynamic, ordinary hook-shaped, callback-bearing, constructed, and tagged
  call shapes without React hook-name heuristics, while preserving compiler-proven
  hook setup, compatibility-mode live receivers, and changing event captures.
  Witness callable and receiver identities alongside explicit inputs, compare
  memoized component and ordinary-list projection inputs with `Object.is`, and
  preserve optional, aliased, cyclic, function-valued, or lexically shadowed
  setup-hook paths. Add
  bounded diagnostics for detectable state-snapshot mutations, cross-row writes
  from retained keyed scopes, and impure clock or random reads, and document the
  assumptions the production memoizer trusts.

  Expose the template-call memoization benchmark through the Octane MCP benchmark
  tool.

## 0.2.20

### Patch Changes

- af0d999: Drain queued behavior-root interactions with amortized cursor compaction and
  constant-time pending-adoption bookkeeping so late modules and separately
  settling async adoptions stay linear while preserving FIFO and reentrant delivery.
  Expose the accompanying browser benchmark through the Octane MCP benchmark tool.
- 7e62361: Expose the development form-diagnostics benchmark through the MCP benchmark tool.
- 4393bea: Expose the TSrX component-graph compilation benchmark through the MCP benchmark tool.

## 0.2.19

### Patch Changes

- 7535acd: Deduplicate binding hook sub-slot derivation behind Octane's shared helper while preserving each binding's slotless and symbol-identity behavior.

## 0.2.18

### Patch Changes

- 1a99f1b: Add the deterministic React-library port workflow, preserve the previous skill-name alias, and update React rewrite classifications.
- 409682b: Expose the Activity benchmark through the MCP benchmark tool.

## 0.2.17

### Patch Changes

- 64c004a: Expose the hook-store-composition benchmark through the MCP benchmark tool.
- 922b2d4: Expose the universal external-store benchmark through the MCP benchmark tool.
- 489a886: Expose the hook-memo allocation benchmark through the MCP benchmark tool.

## 0.2.16

### Patch Changes

- 371d9f9: Register `@octanejs/alien-signals` in the MCP binding catalogs.
- b3537b4: Register `@octanejs/textarea-autosize` in the CLI and MCP migration mappings.
- 87394b4: Register `@octanejs/pdf` in the MCP binding catalogs.
- 89a3b1d: Register `@octanejs/popper` in the MCP binding catalogs.

## 0.2.15

### Patch Changes

- 677182d: Expose the deterministic minimal-import bundle reachability benchmark through
  the MCP server.
- 9374c55: Expose the SPA navigation benchmark through the Octane benchmark MCP tool.

## 0.2.14

### Patch Changes

- 7a6fba3: Expose the new `svg-dashboard` benchmark suite through the MCP server: a
  hand-rolled-SVG observability dashboard rendered byte-identically by octane,
  react, solid, and svelte fixtures, stressing path-`d`/transform churn, keyed
  reconciliation inside `<svg>`, foreignObject namespace push/pop, portal
  tooltips into an SVG overlay, and the `createElement` icon de-opt path.

## 0.2.13

### Patch Changes

- 25c82b0: Expose the deterministic minimal-import bundle reachability benchmark through
  the MCP server.

## 0.2.12

### Patch Changes

- 48e2397: Keep universal state updates proportional to their retained owner subtree: a leaf `setState` replays only its owning component, keyed-list item state and several owners updated by one event replay their nearest shared component ancestor instead of the root, updates under an idle `@try`/Suspense boundary stay scoped (active episodes and retained-hidden content still replay from the root, and a scoped render error falls back so the boundary catches it), structural updates that insert, reorder, or remove hosts commit through the scope's physical frame, compact leaf rows driven by list state update within their owning list component, and scoped commits edit the accepted listener tables in place instead of cloning them. Also avoid cloning the object driver's full instance map when preparing a small host batch, and expose the corresponding benchmark through the MCP server.

## 0.2.11

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

## 0.2.10

### Patch Changes

- f8e5a00: Port guidance now asks for the pinned upstream source and its tests. `bridge-react-package`, the `octane_bridge_react_package` plan steps, and the `octane_engineering_plan` gates for binding paths all require bridging module by module from a pinned copy of the upstream release, covering its exports rather than the demo path, running that release's own suite as the parity oracle where it ships one, and recording whatever parity cannot reach as a divergence.

## 0.2.9

### Patch Changes

- 1b3f441: Correct the React component migration guidance to use the supported TSRX switch case and default clause grammar.

## 0.2.8

### Patch Changes

- cca6ee5: Initialization instructions are now one orienting sentence plus a pointer to
  `octane_engineering_plan`, instead of a standing mandate restating the
  correctness, performance-evidence and self-review gates in every session. The
  gates are unchanged and still returned in full by that tool.

  Repo skills are read from `.rulesync/skills` rather than the deleted `.ai/skills`,
  and `octane_project_map` returns the generated `AGENTS.md`. Four tool
  descriptions were reworded from what they do to when to call them.

## 0.2.7

### Patch Changes

- 9d4b8c0: Expose the deterministic Lynx preview/IFR bundle-size suite through the
  benchmark runner tool.

## 0.2.6

### Patch Changes

- 2f2a204: Expose the Lynx list-allocation suite through the benchmark tool's validated
  suite list.
- a88f9ea: Add a Cloudflare Workers adapter for full-stack Octane apps. Vite and Rsbuild
  can now emit a Worker-targeted server bundle and a streaming module Worker for
  Workers Static Assets, with Cloudflare bindings and execution context available
  through request-scoped middleware and server-route context.

  Initialize streaming SSR token entropy on the first render so module evaluation
  remains valid in runtimes that prohibit random generation in global scope.

## 0.2.5

### Patch Changes

- 07511e4: Keep `onChange` native while adding compile-time and development-runtime text-host
  diagnostics, explicit commit intent, and correct controlled checkbox/radio
  restoration through native change. Use native `input` events for Base UI text
  controls while preserving the number field's form-facing native change commit,
  propagate authored-source diagnostics through MDX compilation and Vite, and make
  Octane's bridge tooling target React-style text-host event wiring without rewriting
  component callbacks or non-text controls.
- 693bc7b: Add always-on engineering guidance, a production-grade Octane software skill, and
  structured performance and self-review gates for coding agents.

## 0.2.4

### Patch Changes

- c4df384: Refresh the MCP server's repository knowledge to current main: `octane_benchmark` drives the unified runner (`node benchmarks/bench.mjs`) with the full 22-suite manifest, including the React-hosted island and Three renderer/size suites, and a `quick` smoke-pass option; path triage and validation planning cover the Vercel deploy adapter, the evals package, the metaframework plugins, and the website with their vitest projects; the React-API compatibility map corrects stale entries (`lazy` and `useDebugValue` exist, `renderToStaticMarkup` and the streaming `renderToPipeableStream`/`renderToReadableStream` ship under `octane/server`); and the bundled skills reflect controlled inputs matching React, compiler-inferred dependency arrays, the hooks-in-loops compile error, streaming SSR, the production SSR build (`octane-preview`, `@octanejs/adapter-vercel`), and the full bindings table.
- 01a20fb: Add a `./bridge` subpath export and `bridgeReportFromSource(source, { packageName })`, a filesystem-free variant of `bridgeReport` for hosted consumers that scan pasted source instead of an installed package.

## 0.2.3

### Patch Changes

- 15bad71: Add the Apollo Client 4.2.6 binding for Octane, including the complete client
  hook and query-reference surface, Suspense integration, public declarations,
  testing exports, and an Octane `MockedProvider`. Register Apollo in the MCP
  compatibility catalog.
- b41a91a: Add a bundler-neutral Octane compiler and app core, a low-level Rspack 2
  compiler integration, and a full Rsbuild 2 metaframework plugin with routing,
  streaming SSR, hydration, HMR, production client/server builds, preview, and
  adapter support. Keep the existing Vite integration on the same shared core.
- 95872c1: Add the `@octanejs/i18next` binding, porting react-i18next 17.0.9 hooks,
  providers, rich translations, ICU declarations, HOCs, Suspense namespace
  loading, and SSR integration onto Octane while reusing i18next unchanged.

  Teach the MCP binding registry to route react-i18next users to the maintained
  Octane package.

- 2c90d45: Add Redux Toolkit and RTK Query bindings for Octane, including generated query,
  mutation, infinite-query, prefetch, ApiProvider, and dynamic-middleware hooks.
  Register the binding in the MCP compatibility catalog and binding documentation.
- f96a1f9: Add the `@octanejs/sonner` port of Sonner 2.0.7, including the complete toast
  API, Toaster UI and styles, promise and custom toasts, targeted toaster support,
  SSR/hydration support, and differential parity coverage against real Sonner on
  React. Register the new binding with the MCP package bridge.
- d173805: Keep MCP package routing and hook guidance synchronized with the complete
  workspace binding inventory and the public state-hook tuple, and declare the
  Node 22 minimum runtime.

## 0.2.2

### Patch Changes

- 4c7a5ed: `octane_bindings` / `KNOWN_BINDINGS` now covers all fourteen published
  `@octanejs/*` bindings (adds hook-form, base-ui, recharts, redux,
  testing-library, mdx), and the test suite derives the expected set from the
  workspace manifests so the map can no longer drift silently.

## 0.2.1

### Patch Changes

- 3431ec3: Rework the MCP server around Octane users, not just repo maintainers. Skills now ship
  inside the npm package (previously they were read from `.ai/`, which only exists in the
  monorepo checkout, so a globally installed server was broken): `bridge-react-package`,
  `migrate-react-component`, `react-divergences`, and `setup-ssr`. New tools:
  `octane_bridge_react_package` statically scans any React package (or source directory)
  for React API usage and returns an Octane compatibility report with a verdict and a
  step-by-step bridge plan; `octane_bindings` lists the official `@octanejs/*` ports.
  Maintainer tools (project map, triage, validation plan, benchmarks, issue context) now
  register only when the server detects an octane monorepo checkout. Path triage and the
  docs learn about the `radix` binding and the MCP server package itself.
