# @octanejs/mcp-server

## 0.2.32

### Patch Changes

- 3a859dd: Specialize DOM binding child programs for explicitly fixed primitive props so unused presentation branches do not ship. Caller propagation is opt-in through `domBindingFixedProps`; default child requests remain generic and shared. Dynamic values, literal defaults, DOM adoption, and renderer hydration handoff retain their existing behavior.

  Expose the fixed-prop binding benchmark in the MCP benchmark tool alongside the unified runner.

## 0.2.31

### Patch Changes

- 5ead1ff: Expose the conversation-streaming benchmark through the MCP benchmark command.

## 0.2.30

### Patch Changes

- ede01de: Accept native signal handles in DOM styles, including individual CSS properties and whole style values. Direct template styles update without rerunning component setup, and preserve signal cleanup, Suspense, server rendering, and hydration. Export `SignalCSSProperties` for signal-aware style objects while keeping `CSSProperties` compatible with ordinary CSS consumers.

  Keep binding CSS compatibility aliases pointed at plain `CSSProperties` when their layout helpers consume ordinary CSS values.

  Expose the signal style regression benchmark through the MCP benchmark tool.
- cece195: Reuse unchanged populated SSR replay snapshots and pending streaming settlement
  recorders across retry waves. Preserve metadata rollback, promise identity,
  cancellation, and request cleanup. Add the SSR replay and streaming benchmark
  suite to repository automation.
- 248af4e: Expose the client hot-path benchmark suite through repository automation, with
  deterministic branch hydration-lookup and descriptor-key work guards.
- 7d4dc4f: Reduce universal renderer prop-shape churn, materialization allocations, repeated feature scans, and unnecessary compact-list traversal while preserving keyed identity, transactional callbacks, and transport contracts. Expose the universal measurement suites through MCP.
- Reduce repeated runtime work on the client and server. Empty descriptor hosts skip
  child-list scratch arrays, passive-effect batches reuse their scheduling callback,
  and identical server styles reuse their records and replay snapshots.

  Expose the runtime-style-dedup, empty-host-children, and passive-scheduling
  benchmark suites through the MCP benchmark tool.
- 13604b9: Avoid temporary boundary-collection copies during streaming SSR completion,
  error and abort scans, and reuse immutable CSS/head snapshots for completed
  boundaries. Extend the benchmark catalog with the final SSR and client coverage
  investigations from the runtime performance audit.
- 527358c: Complete the remaining Strong compiler checks for fetch-driven effects, effect chains, prop-derived initial state, explicit and null dependencies, manual memo hooks, JSX list mapping, index keys, suppression props, trusted HTML, and compatibility imports. Preserve equivalent dependency arrays as hints and report them without failing strict CLI analysis. Add compiler-owned declaration caching for Strong authoring, the `trustHTML`/`TrustedHTML` API, and nominal Strong JSX types while preserving compatibility modules.

  Strong opt-in intentionally changes generated code for eligible hook-input declarations: their identities are cached in development and production until inferred inputs change. It also normalizes proven built-in hook aliases and infers dependencies for unshadowed `undefined` placeholders. This applies to both the directive and the global `strong: true` option. Ordinary callbacks and mutable values retain their authored evaluation and lifetime. The keyed `@for` migration applies to `.tsrx`; keyed JSX mapping remains supported in `.tsx`.

  CLI JSON reports include the hint count even when it is zero, and MDX diagnostic types represent errors, warnings, and hints.

  The eager prop-state check covers both `useState(value)` and `useReducer(reducer, value)`. A lazy state initializer or explicit third reducer initializer declares a deliberate initial capture. Subscription and timer callbacks keep their event-driven semantics and are excluded from effect-chain writes.
- 777cef3: Align ViewTransition with React 19.3: fix activation classes, type maps, authored
  style restoration, mutation and layout detection, nested sharing, instance refs,
  and callback cleanup at animation finish. Forward native transition types, keep
  unanimated controls interactive, and wait for relevant resources and navigation.
  Animate streamed Suspense reveals with coordinated hydration and client updates.

  Prepare ViewTransition renders with staged DOM commits so snapshot activation uses the finished boundary props while preserving existing node identity and committed lifecycle visibility.

  Keep ordinary DOM operations on an inline native receiver path to avoid per-node staging helper calls when no ViewTransition is active.

  Skip inactive staging calls during effect and scope cleanup, including Activity and Suspense deactivation after a ViewTransition has completed.

  Add opt-in `scope="element"` boundaries with local names and pseudo-element handles,
  independent sibling and nested animations, coordinated streamed reveals, and
  normal DOM commits when native element transitions are unavailable.

  Expose the ViewTransition bundle and native-work benchmark through the MCP benchmark tools.

## 0.2.29

### Patch Changes

- fdb790a: Keep nested scoped JSX responsive to context changes, isolate hooks and memo caches across independently compiled render bodies, and invalidate stale output when lazy bodies change. Preserve component ownership across mixed compilation modes. Expose the production body-ownership benchmark through MCP.
- 8e5ca22: Preserve accepted scoped descriptor children when Providers change host/component child shapes. Reuse known descriptor event names and reduce delegation arrays, child traversal, redundant persistent host writes, repeated form source resolution, and select option reads while preserving live DOM, event, and form-control behavior. Expose the descriptor-renderer benchmark suite through the MCP server.
- ade5be8: Reduce compiler-generated handler, branch capture, and server rendering overhead while preserving event, branch, and SSR evaluation semantics.

  Expose the compiler-output benchmark suite through the MCP benchmark tool.

- 1e12db7: Reduce hook path resolution, optional-argument handling, state getter lookups, and warm-plan bookkeeping. Reuse external-store subscription dependencies when the subscriber is unchanged. Add deterministic Hooks performance diagnostics to the benchmark catalog.
- 6284156: Reduce scheduler batch bookkeeping and skip ref sorting for sibling-only attachment queues, preserving update ordering, effect lifecycle checks, and render-loop limits. Expose deterministic scheduling benchmarks through the MCP benchmark catalog.
- 3c1cc55: Restore enumerable symbol values when a root render suspends and preserve keyed
  row state when an urgent update shares a batch with a suspended removal. Reduce row
  input and retirement bookkeeping, and reuse the live DOM value already read
  when journaling descriptor text updates. Expose the root transaction benchmark
  suite through the MCP server.
- 8a45222: Reduce DOM attribute, spread-prop, template mounting, metadata, and delegated-event work while preserving hydration, rollback, native event descriptors, and custom-element connection behavior.

  Expose the DOM attribute, template mount, and spread host benchmark suites through the MCP benchmark tool.

## 0.2.28

### Patch Changes

- 432b25b: Expose the update-bindings skill in repository mode and route binding maintenance by source ownership, preserving direct upstream imports and copied-code evidence requirements.

## 0.2.27

### Patch Changes

- de3f2e6: Index universal owner drafts only when a render reads an earlier owner's hook or ref, preserving fast reads of the newest draft and the latest draft after retries.
  Expose the new universal draft lookup benchmark in the MCP suite catalog.
- 3606d04: Keep distinct client and server `memo()` wrappers on stable property shapes while preserving live defaults and static-hoisting behavior.
  Expose the memo wrapper shape benchmark in the MCP suite catalog.
- 1c28da5: Keep scoped JSX element and value descriptors on stable property shapes while preserving deferred children, cloning, and server rendering behavior.
  Expose the scoped descriptor benchmark in the MCP suite catalog.
- 1298a69: Reject known ambient browser-state reads during Strong renders with `OCTANE_STRONG_RENDER_AMBIENT_READ`, including browser handle aliases and `globalThis` property reads outside known standard language builtins. Preserve shadowing, events, effects, external-store snapshot callbacks, and lazy state initialization, and document how to render subscribed snapshots safely across server and client.
- 856febc: Reject render-time reads of reassigned module-scope `let` and `var` bindings in Strong modules with source-located diagnostics. Keep compatibility modules and event, effect, and deferred reads unchanged, and document the snapshot-safe alternative.
- 236d4b5: Reject render-time reads of `useRef.current` in Strong modules with a source-located diagnostic, while retaining event and effect reads and compatibility-mode behavior. Document the rule in Octane's authoring guidance and MCP skill.
- a8f34fd: Reject render-time calls to known state getters from `useState`, `useReducer`, and `useLinkedState` in Strong modules, with source-located diagnostics. Keep event, effect, deferred, and compatibility-mode calls legal and document the snapshot-safe render pattern.

## 0.2.26

### Patch Changes

- 0ba4016: Reuse fresh universal owner draft collections during the first render pass instead of replacing them immediately.
  Expose the new owner-draft benchmark in the MCP benchmark suite catalog.

## 0.2.25

### Patch Changes

- 1846318: Recognize the current `@base-ui/react` package name when locating Octane's Base UI binding.

  Recognize `@base-ui/utils` as the published `@octanejs/base-ui-utils` binding.

## 0.2.24

### Patch Changes

- 44d50db: Recognize exported element-kind symbols as introspection labels during binding preflight, while continuing to reject unsupported renderer use. Register the verified octane-is binding for react-is.

## 0.2.23

### Patch Changes

- 2527340: Register the Sanity content and Thinking Orbs packages in the React-to-Octane
  binding catalog.

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
