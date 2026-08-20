# Static shells and independently hydrated islands

Status: proposed. Source investigation began at `1ac623053` on 2026-08-20.
The proposed modes and protocol are not shipped APIs. The isolated export-retention
experiment below has measurements; no static-shell performance result exists.
The existing public contract remains [deferred hydration](./deferred-hydration.md).

## Goal

An SSR page may have a root-to-`Hydrate` component chain that produces useful
HTML but has no client work of its own. Let an application omit that shell's
hydration and, when nothing else needs its exports or module effects, omit its
JavaScript too. Interactive islands must still adopt their server DOM, receive
the right inputs, and preserve normal Octane behavior.

These are three separate proofs:

1. The shell has no required client render, commit, or cleanup behavior.
2. The shell is immutable for this entry's lifetime, or a supported update path
   remains available.
3. Removing its client graph does not remove another consumer's exports,
   singleton identity, module effects, or styles.

Having no local state or event handlers proves none of these on its own. Start
with an explicitly opted-in, immutable SSR/SSG document route. Do not change
ordinary `hydrateRoot`, `root.render`, or client navigation semantics.

## What exists today

| Existing mechanism                                                                                                                                                                                | Consequence for this work                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [Compiler-owned Hydrate extraction](../packages/octane/src/compiler/hydrate-boundaries.js) creates stable `?octane-hydrate=0` / `0.0` requests from the original source.                          | Reuse this independently reproducible entry mechanism; do not require an adapter-owned virtual-module cache.                              |
| Exclusive private declarations can move into a child chunk. Shared/eager declarations, public exports, and declarations containing another Hydrate site are retained.                             | Better declaration ownership can improve splitting independently of static shells. Preserve shared identity and initialization behavior.  |
| A split child receives arbitrary live lexical values through a client capture array and inherits its parent's runtime scope.                                                                      | The current capture protocol is not a server serializer or a standalone island entry.                                                     |
| The exact `split={false} when={never()}` form removes its whole client subtree, preserves its server range, and reserves skipped IDs.                                                             | It cannot represent a shell with live holes: nested Hydrate boundaries also become inert, and a client-only mount renders no descendants. |
| [The app bootstrap](../packages/app-core/src/codegen.js) reconstructs page/layout/root boundaries and hydrates the complete root.                                                                 | A new entry mode must discover islands without first importing and executing that shell.                                                  |
| [Vite](../packages/vite-plugin-octane/src/client-assets.js) and [Rsbuild](../packages/rsbuild-plugin-octane/src/client-assets-plugin.js) collect CSS reachable through deferred Hydrate branches. | Preserve eager styling without turning deferred JavaScript into an eager preload. Include the complete rendered route composition.        |
| [Astro's adapter](../packages/astro/src/client.js) supports independent roots, identifier prefixes, opaque static slots, refresh, and disposal.                                                   | Reuse these ownership precedents and the existing hydration-range bridge; do not invent unrelated DOM-ownership rules.                    |

The compiler's existing hookless, single-root, auto-memo, and warm-plan metadata
is not an inertness proof. Memoization still performs an initial render, and its
pure-render contract can admit imported helpers or descendants whose client
behavior is unknown to this module.

## Proposed entry modes

The following names are design labels, not configuration options yet:

| Mode      | Behavior                                                                               |
| --------- | -------------------------------------------------------------------------------------- |
| `full`    | Current whole-root hydration; default and fallback for unproven entries.               |
| `none`    | Proven immutable document with no live island frontier; no Octane hydration bootstrap. |
| `islands` | Immutable server-owned shell plus independently addressable Hydrate frontiers.         |

Choose modes per route **and selected export**, not per file. One module can
export both an immutable document and a component used by a client-rendered
route. Planned export-aware loading and complete composed-route CSS coverage
are separate opportunities; neither proves an entry is safe for `islands`.
Export-aware loading is not shipped and remains blocked by the continuation
semantics described below.

Build-time uncertainty selects `full`. A request-time serialization failure
must be detected before the specialized response/bootstrap commits. It can use
an explicitly emitted full-hydration recovery entry, or reject a strict
island-only render. A route retaining a recovery entry may save initial bytes
without removing the shell from the total client graph. Never silently fall
back to overlapping full-root hydration after individual islands have started.

## Parked investigation: export-aware route loading

The current bootstrap imports a route's complete module namespace and selects
an export using a runtime name or the default/first-PascalCase fallback. That
namespace can keep unrelated exported components and their dependencies in a
production bundle, even when configuration explicitly names one component.

A synthetic production fixture at `1ac623053` made an unused export reference a
32,809-byte deterministic payload. Replacing namespace loading with a real
`export { Page as default }` facade removed that payload. Total emitted raw JS
changed from 36,405 to 3,547 bytes in Vite 8.1.5, and from 36,130 to 3,271 bytes
in Rspack 2.1.4. The selected Page returned the same value, and the route's
top-level effect still ran once. Both unchanged runs produced the same sizes.
The harness used Node 26.4.0, Vite's esbuild production minifier with `esnext`,
and Rspack's native production minimizer with ESM output. These are synthetic
reachability measurements, not application savings or a correctness proof.

The optimization was not retained because broader execution tests exposed
observable timing changes:

- A getter-based one-export projection adds a promise reaction before the
  bootstrap reads the live binding; the esbuild control can select a later
  value.
- An immediate `.then(module => ({ Page: module.Page }))` projection allows
  tree-shaking, but Vite can place that selection inside its preload helper.
  When the route is already statically imported, it can select an earlier
  value than ordinary namespace loading.
- An async loader with a namespace local, or a separate promise local, avoids
  that particular early read. The tested Vite output retained the unused
  payload, however, and the additional continuation can still delay rendering.
- A real re-export facade preserves live bindings, but can introduce a new
  asynchronous chunk when the original module is already eager. The native
  eager/mutable-export matrix changed the selected value in 9 of 16 Vite/Rspack
  comparisons. It is not a universal timing fix.

Proving that an export is a local immutable `const`, or a function declaration
with no writes, is insufficient: an unchanged function can read mutable module
or store state when it finally runs. The contract must preserve the original
bootstrap continuation, including selection, pre-hydrate work, rendering, and
error timing. Current integration metadata describes output shape and export
usage, not this stronger property. Transitive re-exports, CommonJS, unknown
transforms, cycles, and HMR also need explicit handling.

Keep whole-namespace loading until a separate change can prove both native
tree-shaking and equivalent observable continuation behavior. Prefer a design
that communicates exact export reachability to the bundler without adding a
new promise or module-evaluation boundary. Its regression matrix must include
eager, already-loaded, and genuinely lazy modules; mutable exports; immutable
functions reading mutable state; missing/string-named exports; module effects;
and errors. Do not substitute a narrow immutable-binding check for that proof.

## Eligibility: prove the shell, stop at live frontiers

The neutral compiler should return versioned summaries for component exports:
render/call dependencies, Hydrate frontier sites, required client capabilities,
input dependencies, module effects, and source-located reasons a proof failed.
Resolve imported components and helpers through the real bundler graph. Compute
a conservative fixed point across dependency cycles. Unknown means `full`.

| Area                            | First-version rule                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State and lifecycle             | No own or transitive stateful/custom hooks, effects, layout/insertion effects, imperative handles, refs, or client cleanup outside an island.                                                                                               |
| Host behavior                   | No event handlers, spread-hidden handlers/refs, behavior attachment, portals, function form actions, controlled `value`/`checked`, or unknown host spreads. Native links and ordinary server forms can remain native.                       |
| Context and subscriptions       | No live provider, context read, external-store subscription, router, shared store, or `use()` obligation crossing the frontier without an explicit bridge.                                                                                  |
| Inputs and updates              | Request-specific values may be immutable snapshots. Changing root props, SPA navigation, browser-only reads, mutable globals, getters, unknown calls, and external mutations require an ordinary client path.                               |
| Children and component identity | Dynamic tags, component-as-prop, render props, unknown renderables, escaped descriptors, mutable component properties/defaults, and unknown wrappers deopt. Proven inert slots may later use opaque server-owned HTML.                      |
| Module behavior                 | Preserve live exports, bare imports, registrations, singleton identity, cycles, initializer order/errors, and stylesheet reachability. Direct eval and runtime TypeScript forms require a sound reference analysis or a conservative deopt. |
| Boundaries and errors           | Suspense, ErrorBoundary, Activity, ViewTransition, head/resource ownership, custom renderers, and possible client error/retry behavior require a dedicated proof. Do not erase the only recovery owner.                                     |
| IDs and data seeds              | Skipped shell IDs and each island's `useId()`/`use()` scope must be reconstructible exactly. Otherwise retain full hydration.                                                                                                               |

Client behavior inside a frontier is allowed: that island still runs normally.
For the first implementation, a nested Hydrate owned by a live outer island
continues through today's parent-first runtime path. Do not give two roots
reconciliation ownership of the same descendants.

## Proposed protocol

### 1. Build-time plan

Produce one canonical, versioned manifest containing route/export identity,
proof result and reasons, stable island entry/export references, and their
concrete JavaScript/CSS assets. Separate component-invocation effects from
module-evaluation effects. Keep the compiler's parsed-AST/copy-on-write/one-print
architecture; do not discover safety by rewriting emitted JavaScript.

Preserve actual module identity when partitioning declarations. A later shared
support query may hold a dependency SCC used only by multiple islands. Start
with simpler proven cases, such as immutable primitive constants; do not copy a
stateful singleton into several chunks.

### 2. Per-response SSR records

The server renders the original component tree. It records the **instances
actually rendered**, not merely lexical sites: branches, loops, keys, nesting,
and streaming change which instances exist. Each record needs:

- A manifest/build version, stable entry reference, and unique DOM/adoption ID.
- The parent/owner relationship and activation strategy.
- Only the required serializable props/captures, plus any explicitly supported
  module-reference or context bridge.
- The matching ID scope/count, `use()` seeds, and stream-readiness/ownership
  token.
- A defined error, cancellation, and disposal owner.

Do not serialize the existing capture array blindly. It can contain callbacks,
refs, promises, stores, DOM nodes, class instances, or a complete props object
with server-only fields. Begin with a small allowlisted data codec, narrow
captures to used values where safe, and reject accessors, unsupported identity,
and non-serializable closures. Any future callable-reference format must name
trusted build-manifest exports, not arbitrary import URLs. Escape inline data
correctly and preserve CSP/nonce handling.

Use the existing [Hydrate metadata and stream protocol](../packages/octane/src/constants.ts)
where its meaning matches. New independent scopes must agree with SSR IDs and
seeds regardless of activation order. Streaming records become activatable only
after their validated, renderer-owned DOM range is ready. Abort/rejection must
retain a valid server fallback or enter an explicitly available recovery path.

Suspended retries need precise seed ownership as well. A runtime-only
supersession prototype replayed an already-adopted ancestor to bypass an obsolete
pending child; the ancestor then consumed a later child's remaining server seed
as its own value. That prototype was discarded. Neither reopening an activation
gate nor replaying the omitted shell is a safe resume protocol. Prove how each
owner resumes its `use()` positions before permitting changed inputs, and test
seeds on both sides of an externally owned suspension, cancellation, and
out-of-order island activation.

### 3. Client bootstrap and ownership

Install the lightweight early event-capture entry before waiting for route or
island code. A coordinator reads the trusted manifest/response records, starts
strategies and permitted prefetch work, then imports the runtime and island
entry when needed. Activation adopts existing DOM and commits refs/effects and
replayed events through the ordinary runtime.

Reuse the existing Hydrate scheduler, event replay, ID/seed handling, and error
channels where possible. The coordinator owns registration and cancellation;
the activated island owns its reconciled range and lifecycle. Removing a route
or aborting its owner cancels pending activation and disposes live roots once.
The immutable shell remains server-owned. A future live-context bridge or SPA
promotion mechanism needs its own design and tests; it is not implied by this
entry mode.

## Deferred Hydrate recovery follow-up

Completed descriptor adoption and divergent fragment recovery are separate
contracts. Runtime-only, compiler-shaped probes against the existing runtime
show that a mismatched multi-root fragment inside Hydrate can report a
recoverable mismatch, remove its own insertion anchor, and then throw
`NotFoundError` while rebuilding. Both immediate and suspended cases reproduce
on the pre-change base. This is an existing limitation, not fixed by deferring
the descriptor cleanup claim; native compiler coverage is still required.

A recovery design must validate and replace only a proven owner range. Use the
actual current scope's insertion owner, including adopted lite-scope ranges,
and retain the live end anchor and unaffected siblings. A fresh fragment may
contain component, conditional, list, or Suspense holes: those children must
client-build without adopting a following owner's server range. Suppressing DOM
adoption must not leave the recovered subtree's serialized `use()` values for a
later sibling to consume. Replaying setup or restarting the whole island is not
a safe shortcut around seed, ID, ref, effect, and browser-state ownership.

Before shipping this recovery, add public compiler regressions in development
and production for immediate and suspended mismatches, nested and lite owners,
mixed directive holes, later sibling identity/events, cancellation, repeated
suspension, and seeds before and after the replaced range. The independent-island
protocol must not assume this stronger recovery contract already exists.

## Vite, Rspack, and app integration

Keep proof rules, reference IDs, manifest validation/versioning, and diagnostics
in the bundler-neutral compiler/app-core layer. Native bundlers remain
authoritative for resolution, package conditions, side effects, export liveness,
shared chunks, and final asset URLs.

- **Vite:** carry summaries in transform metadata; use `resolve`, `load`, and
  `getModuleInfo` in a cycle-safe analysis before generating the selected client
  entries. The existing cross-module void-component proof is precedent for
  fingerprinting and fail-closed invalidation. `generateBundle` maps surviving
  entries to assets; it is too late by itself to justify removing a graph root.
- **Rspack:** transport serializable summaries through `module.buildInfo.octane`
  and the parallel-loader/finalizer path. Analyze `moduleGraph` at
  `finishModules`; use optimized used-export information to verify the plan.
  Generate entries before optimization. At `processAssets`, map references via
  `chunkGraph`, including concatenated/shared modules, to the same manifest ABI.
- **App core:** keep route identity as module plus selected export, preserve
  existing module-path asset lookups for ordinary routes, and choose the
  bootstrap from the route plan. Plan server-graph analysis before client-root
  pruning, then build client entries/assets and render the server against that
  manifest. Do not infer SSR-only stylesheet reachability from an already-pruned
  client graph.
- **CSS:** include styles for the page, layout, configured pending/catch
  boundaries, and rendered deferred descendants. Preserve scoped-style hashes,
  cascade order, deduplication, and CSS imported only by a removed server shell.
  No deferred island JavaScript should become module-preloaded merely to obtain
  its stylesheet.

Development/HMR must invalidate proofs when source, resolved exports, or graph
ownership changes. A full reload is acceptable for the first specialized mode;
silently retaining an old eligibility decision is not.

## Delivery phases

1. **Establish evidence and harden existing splitting.** Add representative
   eager/split/shared/permanent-static fixtures, a split-retention report, and
   regressions for unsafe lexical/declaration movement. Land composed-route CSS
   fixes independently. Planned export-aware loading remains unshipped until
   its continuation and reachability tests pass on both native bundlers. Record
   matched Vite/Rspack baselines before claiming application savings.
2. **Proof-only compiler and graph pass.** Emit capability/dependency summaries
   and explain every `full` decision. Add negative controls for each rule above.
   No runtime behavior changes in this phase.
3. **Opt-in document prototype.** Support buffered/prerendered immutable
   documents, known strategies, serializable inputs, and independent top-level
   island frontiers. Add the versioned SSR records and bootstrap. Keep existing
   full hydration as the default; prove that the shell need not execute.
4. **Client-graph removal.** Connect proven entries to both native bundlers,
   retain required exports/effects/CSS, and measure initial and total bytes.
   Add shared/recursive declaration slicing only when measured benefit justifies
   its identity and initialization complexity.
5. **Expand deliberately.** Streaming, opaque slots, context bridges, nested
   independent owners, richer serialization, and SPA promotion each require
   separate acceptance tests and an explicit update/recovery contract.

## Acceptance tests

| Area                       | Required evidence                                                                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compiler proof             | Public compiler tests in TSRX and TSX, dev and production, client and server. Each unsafe construct has a negative control that retains full hydration; diagnostics identify the authored reason. Shared exports and direct-eval/runtime-TS references remain usable.                   |
| SSR and adoption           | Compare normal and specialized visible HTML. Activate islands in different orders; original nodes, user-entered values, focus, and caret survive. Repeated/keyed/nested instances receive correct props and unique IDs without mismatches.                                              |
| Interactions and lifecycle | Withhold real production chunks in Chromium. Early native clicks/keyboard activation replay exactly once; later interactions remain live. Effects/refs run at the documented commit point. Cancellation, removal, import failure, retry, and cleanup do not leak or double-commit.      |
| Updates and fallback       | Ineligible state/context/store/router/controlled-input fixtures retain normal behavior. Client-only mounts, `root.render(newProps)`, and navigation either use a supported ordinary path or are rejected before choosing immutable mode. No partial independent-root/full-root overlap. |
| Graph and styles           | Real Vite and Rspack builds select the correct export when two routes share a module. Required module effects run in the same order/identity. Page/layout/root-boundary and deferred CSS is styled before activation, while withheld island JS is neither fetched nor preloaded early.  |
| Errors, streams, security  | Catch ownership, unhandled errors, mismatch reporting, stream abort/rejection, and stale build manifests have defined outcomes. Payloads containing script delimiters cannot inject executable markup; CSP and manifest import restrictions hold.                                       |
| Removed work               | In an eligible fixture with no recovery entry or other client references, the shell graph is absent from the emitted client manifest. An otherwise identical fixture with an effect, shared export, or mutable input retains it.                                                        |

Extend the existing [hydration interactivity](../benchmarks/hydration-interactivity/README.md),
[hydration stress](../benchmarks/hydration-stress/README.md), bundle-size,
codegen-size, and [compiler-throughput](../benchmarks/compiler-throughput/README.md)
harnesses. Report eager JS, deferred JS, total raw/gzip/Brotli bytes, CSS and
payload bytes, chunk requests, parse/evaluation and activation latency, SSR
throughput, compile time, and retained memory separately. Use matched
baseline/candidate runs, warmup and repeated samples, with DOM/interaction
semantic controls. Set deterministic ratio budgets from those measurements;
do not turn generated helper names or marker counts into correctness tests.

## Provenance

- [x] An agent drafted this design from the repository's compiler, runtime,
      bundler, and integration sources. Static-shell APIs and benefits remain
      unimplemented and unmeasured; isolated export-retention measurements are
      identified separately above.
