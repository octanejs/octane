# Static shells and independently hydrated islands

Status: independent and deferred hydration, renderer-free island activation, and
an explicit islands-only route mode for the Vite integration are implemented;
automatic shell removal remains proposed. Updated against `main @ c988ad10a` on 2026-09-18, after [#1069](https://github.com/octanejs/octane/pull/1069).
[Issue #1118](https://github.com/octanejs/octane/issues/1118) tracks the remaining
client-JavaScript reduction work, and [issue #1514](https://github.com/octanejs/octane/issues/1514)
tracks renderer-free island activation ([progress](#renderer-free-island-activation-1514)).
The public API is documented in [deferred hydration](./deferred-hydration.md).

## Implemented baseline

| Mechanism | What is implemented | Current limit |
| --- | --- | --- |
| Ordinary split `<Hydrate>` | [Compiler extraction](../packages/octane/src/compiler/hydrate-boundaries.js) creates reproducible child entries and can move exclusively owned private declarations into them. | Activation remains parent-first. Its live client capture array can contain callbacks, refs, promises, or DOM nodes; it is not a server serializer. |
| `<Hydrate independent>` | Compiler-proven standalone entries, [per-instance JSON sidecars](../packages/octane/src/independent-hydration-protocol.ts), deterministic ID namespaces, boundary-local seeds, signal identities, and stylesheet URLs. Vite and Rspack emit matching build manifests. | Requires splitting and supported captures. Parent-owned lifecycle values and unsupported initializers fail compilation; request-time data must pass the codec. |
| Independent-island bootstrap | [Sidecar discovery](../packages/octane/src/hydration/independent-island.ts), incremental/streamed registration, early native intent capture, stylesheet loading before activation, replay, and pause/resume/disposal. | Captured interactions drive pre-root activation; ordinary visibility, idle, media, and custom strategy drivers are absent. The generated activator in [the client runtime](../packages/octane/src/runtime.ts) still calls `hydrateRoot` and loads the renderer. |
| Compiled DOM bindings | [Renderer-free presentation](./deferred-hydration.md#compiled-presentation-on-existing-dom), including supported structural views, direct and subscribed signal reads, `@try`, mount-only effects, controls, events, and cleanup. | Opted in through `'use dom bindings'`. Independent Hydrate selects this tier automatically for a prop-less imported zero-argument view. |
| Permanent-static Hydrate | The exact `<Hydrate split={false} when={never()}>` form erases its client subtree and exclusively owned private declarations, preserves its server range, and reserves skipped IDs. | A static leaf in the hydration ownership tree: ordinary nested boundaries become inert, and an independent descendant fails with `OCTANE_HYDRATE_INDEPENDENT_STATIC_PARENT`. |
| App bootstrap | [The generated client entry](../packages/app-core/src/codegen.js) registers independent islands before loading the route, layout, and configured root boundaries. A `hydrate: 'islands'` route boots from a second, renderer-free entry instead. | The full entry still imports the route module and calls `hydrateRoot` for the complete composed root. The islands entry is Vite-only and requires an author opt-in checked at build time. |

Independent activation does not need to evaluate or hydrate the lexical parent.
This separates module and DOM ownership. The island still loads the renderer and
any imports its extracted entry needs. Likewise,
registering islands alongside whole-root hydration does not delete shell bytes.

The sidecar and early receiver already cover much of this note's original
protocol proposal. Captures use the allowlisted data codec; ordinary live capture
arrays must remain a separate path. `signalSites` belong to the compiler protocol;
arbitrary callback or context transport between islands is outside the capture
codec.

Permanent-static erasure recognizes the two direct `split` and `when` attributes
and a zero-argument call to the imported `never` strategy. Extra props, spreads,
or an indirect strategy retain the ordinary boundary path. The server currently
forces nested boundaries to `never` and suppresses their seed and independent
sidecars. Removing the compiler diagnostic alone would not make live islands
under a static shell work.

## Renderer-free island activation (#1514)

An island can stop loading the renderer only when its view compiles as a
`'use dom bindings'` program. A route stops loading it only when its shell is no
longer hydrated as well. The audit linked from #1514 found that every
independent island in `examples/signal-chat`, the conversation-streaming
benchmark and the Vite plugin fixture was rejected by the binding compiler. The
steps below make islands eligible one construct at a time. Only the last step
removes bytes from a real page.

| Step | Status | Guard |
| --- | --- | --- |
| 1. Diagnose `x$.get()` in a binding view | Done in [#1304](https://github.com/octanejs/octane/pull/1304): runtime error #308 at activation; `.latest()` is rejected at compile time. | |
| 2. Zero-argument views | Done: a view may declare no props parameter. Activation still takes a `BindingSource`; its snapshot is unused. | `bundle-boundaries.test.mjs`: "zero-argument island views adopt module signals without the renderer" (TSRX and TSX, with a `hydrateRoot` control); `behavior-root.test.ts` adopts, hydrates and mounts real SSR output. |
| 3. Lower `.get()`/`.latest()` reads into subscribed projections | Done: imported reads in projections, branch tests, lists and block `const` declarations subscribe; a suspended preparation keeps its last DOM. | `behavior-root.test.ts`: subscribed reads in every accessor form, structure, later publications and block declarations; owner retirement. |
| 4. Mount-only effects as binding activation and cleanup | Done: `useLayoutEffect`/`useEffect` with an explicit `[]` run once after activation and clean up with their view. The `ready` flag pattern moves to a signal set by the effect. | `behavior-root.test.ts`: effect order, branch cleanup and disposal; non-mount effects stay diagnostics. |
| 5. `@try`/`@pending`/`@catch` in binding programs | Done: a `try` region with sticky `@catch`, deferred `reset`, adoption of every server arm, and a claim of a still-streaming boundary. | `behavior-root.test.ts`: arm switching and adoption, a streamed claim, and renderer hydration of the same output. |
| 6. Renderer-free activation and an islands-only route mode | Done: an island selects its child view's program through that view's module, and `hydrate: 'islands'` serves the shell with a renderer-free entry. | `independent-island.test.ts` (selection and fallback); `bundle-boundaries.test.mjs`: "independent islands over binding views activate without the renderer"; `islands-route.test.ts` (production build, shell rejection, renderer reachability); signal-chat e2e budget. |

`examples/signal-chat` is the pilot: both routes are islands-only and every
island is a binding view, with `Metrics` and the composer's `ready` flag moved
to signals. Measured with gzip-9 per script, the deferred route loads 18 scripts
and 71,124 bytes (69.5 KiB) after activating every island, against 160,586 bytes
(156.8 KiB) of client JavaScript, including a 98,222-byte renderer chunk, on
`main @ 02e4eb0ac`. The renderer is not loaded; the e2e suite holds the route to
the 70 KiB ceiling.

A zero-argument view's module declarations resolve to the document's cells,
which a compiled state module installs without the renderer. Delegated binding
handlers run without restoring a custom signal owner, so a deliberately custom
owner still needs `runWithSignalOwner` around its callbacks. Selection is
limited to a prop-less child imported from a project `.tsrx` module; a capture,
a prop, a local child, or a package component keeps the renderer activator.

## Remaining static-shell design

An SSR page can have a root-to-island component chain that produces useful HTML
but has no required client work. Omitting its hydration and JavaScript requires
three separate proofs:

1. The shell has no required client render, commit, or cleanup behavior.
2. The shell is immutable for the entry's lifetime, or a supported update path
   remains available.
3. Removing its client graph preserves other consumers' exports, singleton
   identity, module effects, and styles.

The absence of local state or event handlers is insufficient. Existing hookless,
single-root, auto-memo, and Strong-mode facts are not a complete inertness proof:
they do not establish every imported helper or descendant's client obligations.
Start with explicitly opted-in immutable SSR/SSG document routes and keep
ordinary `hydrateRoot`, `root.render`, and client navigation semantics.

`RenderRoute`'s `hydrate` option selects `'full'` or `'islands'`; `none` remains a
design label:

| Mode | Behavior |
| --- | --- |
| `full` | Whole-root hydration; the default. |
| `none` | Proposed: a proven immutable document with no live island frontier and no Octane hydration bootstrap. |
| `islands` | Implemented for Vite as an explicit opt-in: a server-owned immutable shell with independently activated Hydrate frontiers; the client entry never imports the shell or hydrates the root. |

The implemented `islands` mode trusts the author's opt-in and checks it
conservatively rather than proving it: the build rejects hooks, handlers, refs,
controlled values, ordinary Hydrate, `@try`, signal reads and handle bindings,
spreads, and unknown components in the shell, and any renderer reachable from
the islands entry or `preHydrate`. In development, the server render also
reports the handlers, refs, effects, editable controlled values, and live signal
bindings it actually reaches outside the islands (`RenderOptions.shellWitness`).
The compiler proof below is still the path to selecting a mode automatically.

Choose eligibility per route and selected export. Unknown facts select `full`.
Ordinary parent-first Hydrate is not a standalone frontier. A client navigation
into an islands-only route still needs an ordinary client path; promotion of an
already displayed immutable shell to a live root needs a separate ownership
contract. Do not introduce overlapping root ownership as a silent recovery path.

A compiler proof should emit versioned, source-located capability/dependency
summaries, resolved conservatively across the real bundler graph. Include own and
transitive hooks/effects/cleanup, refs and events (including spreads), controlled
inputs, context/providers and subscriptions, `use()`, dynamic tags and
renderables, component-as-prop/render props, portals, Suspense/error/retry owners,
Activity, ViewTransition, head/resources, changing inputs, and module effects.
Cycles and unknown dependencies resolve pessimistically. Reuse cross-module
fingerprinting and fail-closed invalidation; memoization alone cannot justify
erasure.

Build manifests and instance records already exist. The new work is selecting an
eligible route bootstrap, supporting its activation strategies, and removing the
shell graph, while preserving SSR
instance identity, captures, IDs, seeds, stream readiness, error ownership,
cancellation, and stylesheet reachability. Analyze CSS through the server graph
before pruning client roots: CSS imported only by an erased shell must still
style its HTML. Native bundlers remain authoritative for resolution, effects,
shared chunks, and final asset URLs.

Earlier runtime-only, compiler-shaped probes discarded a shell-replay approach
that lost preceding seeded rows and let an adopted ancestor consume a later
child's server seed. Separate immediate and suspended multi-root Hydrate mismatch
probes removed their insertion anchor and then threw `NotFoundError` during
recovery. These historical probes need fresh public compiler validation against
the checkpoint above; they are not confirmed current defects. Retain them as
negative cases against reopening activation or replaying the shell without a
proof of seed, ID, and range ownership.

## Bounded follow-ups

- **Live independent descendants under a permanent-static range:** validate
  skipped IDs, seed sidecars, early capture's static-ancestor checks, stream reveal
  gating, and disjoint DOM ownership before changing the compiler/server rules.
- **Renderer-free island activation:** select the existing binding artifact only
  when its structural proof passes. Unsupported component behavior retains the
  renderer path; lower bundle size does not prove semantic equivalence.
- **Capture-only work removal:** immutable serialized captures can justify
  deleting pure update expressions. Keep creation code wherever a branch, list,
  boundary, keyed component, or slot can create that node later.

Further proof tiers, transport refinements, and marker removal are tracked in
[#1118](https://github.com/octanejs/octane/issues/1118). They are not prerequisites
for documenting the shipped independent-island contract.

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

## Acceptance and measurement

Each implementation needs public compiler coverage in TSRX and TSX, development
and production, client and server, with a negative control for every unsafe
construct. Use real Vite and Rspack production builds and verify graph removal in
the emitted manifests, rather than only observing a delayed request. An
effectful, shared-export, or mutable-input control must retain its required
client path.

Browser checks should preserve original nodes, user input, focus/caret, IDs and
seeds across out-of-order activation, repeated/keyed instances, streamed waves,
errors, cancellation, and disposal. Native interactions must replay exactly once
while production chunks are withheld. Successful hydration is not evidence that
a shell or renderer-tier proof was sound: mismatch recovery can rebuild DOM.

Extend [hydration interactivity](../benchmarks/hydration-interactivity/README.md)
and [conversation streaming](../benchmarks/conversation-streaming/README.md) with
no-root-hydration lanes. Report eager and deferred JS, total raw/gzip/Brotli JS,
HTML and inline script bytes, CSS, requests, first-interaction latency, SSR and
compiler cost, and retained memory separately. Deferral is not deletion; bundle
ceilings are not observed sizes. Use matched baseline/candidate builds and
semantic controls before claiming savings. The signal-chat measurement above is
a size result for one pilot; no latency or memory result is established by this
note.

## Provenance

- [x] An agent updated this note from the compiler, client/server runtimes,
      independent-island bootstrap, and app entry generator at the checkpoint
      above. Proposed static-shell modes remain unimplemented; retained
      export-loading measurements describe a rejected isolated experiment.
