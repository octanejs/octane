# Lynx native renderer and ReactLynx migration plan

Status: **proposed implementation plan**

Upstream audit date: **2026-07-18**

This plan defines how Octane should become a first-class framework for the
[Lynx](https://lynxjs.org/) native engine and how applications currently written
for ReactLynx can migrate without carrying React, Preact, React Reconciler, or a
DOM facade into the native runtime.

It extends the executable seam in
[`universal-renderer-architecture.md`](./universal-renderer-architecture.md).
That seam already names Lynx as the transported/native proof required before
Octane's universal renderer ABI can stabilize. The task is therefore a real
Lynx host, transport, toolchain, and dual-thread lifecycle—not another renderer
abstraction.

## Decision summary

- Build **Octane on the Lynx Engine**, not Octane on ReactLynx. ReactLynx is the
  behavioral oracle and source crosswalk; its Preact renderer and Snapshot VDOM
  are not runtime dependencies.
- Preserve Octane's compiler-first architecture. Lynx templates lower through
  the existing universal compiler target into immutable host plans and dynamic
  slots. Do not generalize the DOM `Block` runtime or add React Reconciler.
- Publish two packages:
  - `@octanejs/lynx` owns intrinsics, roots, platform hooks, the background
    client driver, the main-thread PAPI host, event/ref/style semantics, and
    testing helpers.
  - `@octanejs/rspeedy-plugin` owns Rspeedy/Rspack integration, the main- and
    background-thread entries, CSS/assets, template encoding, source maps, HMR,
    and `.lynx.bundle` output.
- Deliver in two explicit horizons:
  1. a background-rendered native technical preview using Octane's existing
     asynchronously acknowledged transport; and
  2. ReactLynx-class startup with main-thread first paint, background adoption,
     and main-thread scripts.
- Do not label the background-rendered preview as IFR-compatible. Lynx's instant
  first frame depends on running initial component rendering on the main thread
  while the background thread builds the tree that later takes ownership.
- Keep Lynx event names and propagation (`bind`, `catch`, `capture-bind`,
  `capture-catch`, `global-bind`). Do not introduce DOM `onClick` aliases or a
  synthetic event layer.
- Keep styles, assets, list recycling, measurement, and native UI methods
  renderer-owned. Add a universal capability only when the contract is useful
  beyond Lynx and is proven by the object/transport harness first.
- Start with Android and iOS as release platforms. Keep Lynx Web as a fast build
  and behavioral lane. Add HarmonyOS to the supported matrix only after its
  device/runtime gate is automated.
- Declare `server: "unsupported"` initially. Lynx first-screen adoption is a
  native runtime protocol, not HTML SSR or Octane hydration.

## Intended developer experience

The standalone native project should look like this:

```ts
// rspeedy.config.ts
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

export default defineConfig({
	plugins: [pluginOctane()],
});
```

```tsx
// src/App.tsrx
import { useState } from 'octane';

export function App() @{
	const [count, setCount] = useState(0);

	<view className="page">
		<text>{`Count: ${count}`}</text>
		<view bindtap={() => setCount((value) => value + 1)}>
			<text>Increment</text>
		</view>
	</view>
}
```

```ts
// src/index.ts
import { root } from '@octanejs/lynx';
import { App } from './App.tsrx';

root.render(App);
```

The Rspeedy plugin sets `lynx` as the default renderer for a native application.
A shared web/native workspace can instead opt in by filename:

```ts
import { lynxRenderer } from '@octanejs/lynx/config';

export const renderers = {
	registry: { lynx: lynxRenderer },
	rules: [{ include: 'src/**/*.lynx.tsrx', renderer: 'lynx' }],
};
```

The descriptor is data-only:

```ts
export const lynxRenderer = {
	module: '@octanejs/lynx/renderer',
	target: 'universal',
	server: 'unsupported',
	intrinsics: '@octanejs/lynx/intrinsics',
	text: 'host',
	capabilities: ['visibility'],
} as const;
```

## What “migrate ReactLynx” means

The compatibility target is observable ReactLynx application behavior on the
Lynx platform, adapted to Octane's documented framework model. It is not source
or implementation identity.

Octane owns:

- component execution, compiled hook slots, context, errors, Suspense,
  scheduling, keyed reconciliation, refs, and effects;
- immutable universal host plans and logical native-tree topology;
- render-attempt abandonment and the pre-accept/post-accept commit split; and
- the background listener table and native event update scopes.

The Lynx package owns:

- `<view>`, `<text>`, `<image>`, `<scroll-view>`, `<list>`, form controls, custom
  native elements, and their typed props;
- Element PAPI creation, mutation, classes, CSS scope IDs, inline styles,
  native events, lists, flushing, and teardown;
- background-to-main transport, main-to-background event delivery, page
  lifecycle, init data, global props, native query/ref handles, and UI methods;
  and
- main-thread first rendering, adoption, main-thread worklets, and cross-thread
  function calls once those milestones land.

Rspeedy and Lynx's lower-level framework-neutral packages own bundle assembly,
CSS serialization, native template encoding, and engine loading. The Octane
plugin configures them; it must not copy `pluginReactLynx()` wholesale because
that plugin also installs React aliases, Preact-specific transforms, React
Refresh, and ReactLynx runtime assumptions.

## Audited upstream baseline

The source audit used
[`lynx-family/lynx-stack@bfeac9e`](https://github.com/lynx-family/lynx-stack/tree/bfeac9eb418b1482f27802f7a41408202c23dcdb).
The manifest versions at that commit are evidence, not a compatible release set
to mix freely:

| Surface | Audited manifest version | Role in this plan |
| --- | ---: | --- |
| `@lynx-js/react` | `0.123.0` | Behavioral oracle, public API/test crosswalk, no production dependency |
| `@lynx-js/react-rsbuild-plugin` | `0.18.0` | Reference for dual-layer graph and lifecycle wiring only |
| `@lynx-js/rspeedy` | `0.16.0` | Native toolchain and public plugin host |
| `@lynx-js/template-webpack-plugin` | `0.13.0` | Framework-neutral `.lynx.bundle` assembly candidate |
| `@lynx-js/types` | `4.0.0` | Source intrinsic/event/platform types to adapt renderer-locally |

Milestone 0 must replace this moving-main audit with one exact published Lynx
SDK/Rspeedy compatibility set and one upstream commit. Minimum/current lanes are
added only after the first production bundle works.

Primary upstream contracts:

- [ReactLynx rendering and lifecycle](https://lynxjs.org/react/lifecycle)
- [ReactLynx introduction and platform differences](https://lynxjs.org/react/introduction.html)
- [Lynx scripting runtimes](https://lynxjs.org/guide/scripting-runtime/)
- [Element PAPI for framework authors](https://lynxjs.org/api/engine/element-api)
- [Lynx event handling](https://lynxjs.org/guide/interaction/event-handling)
- [Lynx styling](https://lynxjs.org/guide/ui/styling)
- [Native Modules](https://lynxjs.org/guide/use-native-modules.html)
- [Rspeedy](https://lynxjs.org/rspeedy/)
- [`@lynx-js/testing-environment`](https://lynxjs.org/next/api/lynx-testing-environment/)

## Architecture

### Background-rendered technical preview

```text
.tsrx source
    │
    ▼
Octane universal compiler target
    │ immutable host plan + dynamic slots
    ▼
Octane universal root in Lynx background runtime
    │ one structured-clone-safe batch per accepted commit
    ▼
@octanejs/lynx async transport
    │ root + renderer + version + commands
    ▼
Octane main-thread receiver
    │ validate → stage → Element PAPI apply → one flush → ACK
    ▼
Lynx native UI tree
    │
    └── events → accepted root/version + listener IDs → background root
```

The background-side `UniversalHostDriver` is a client driver. It classifies
events, props, resources, visibility, and public ref handles but cannot mutate
or retain main-thread `FiberElement` objects. The main-thread receiver owns a
separate PAPI host state keyed by the transported logical IDs.

The receiver must never import a mutable global renderer. Every commit, event,
acknowledgement, rejection, fault, and teardown carries the protocol version,
renderer ID, root ID, and monotonically increasing batch version already
defined by `octane/universal`.

### Dual-thread IFR and adoption

The stable target adds a second compiled program:

```text
                         same .tsrx module graph
                       ╱                         ╲
                      ▼                           ▼
        main-thread specialization      background specialization
        stripped render-only core       full Octane universal core
                      │                           │
          first native host tree            parallel logical tree
                      │                           │
          serializable host snapshot ───────────►│
                      │                    adopt/diagnose
                      │◄──────── ownership ACK ──│
                      ▼                           ▼
           native nodes retained          later updates transported
```

The main-thread specialization may not import today's DOM `runtime.ts` or the
full universal module transitively. It needs a PrimJS-safe render-only core or a
small interpreter for compiler-emitted host plans. Effects, native-module
calls, ordinary background handlers, and background-only imports are erased
from that program.

The background initial commit is accepted in adoption mode:

1. The main thread renders and flushes the first host tree synchronously.
2. It records a serializable snapshot containing stable host identity, type,
   topology, public attributes needed for comparison, CSS scope, and initial
   main-thread listener metadata.
3. The background root independently renders the same component graph.
4. The receiver matches the background create/insert program to the first-tree
   snapshot and installs the logical-ID-to-`FiberElement` map without replacing
   compatible native nodes.
5. Ordinary events remain buffered until the background listener table is
   accepted. Main-thread-script events can run immediately.
6. A mismatch either performs a defined repair/remount or reports a source-
   attributed diagnostic. It must never silently attach the wrong logical
   identity.

Component initialization can execute in both runtimes. Compiler diagnostics
and documentation must make render side effects, browser globals, nonportable
imports, and thread-only APIs visible rather than relying on convention.

### Do not generalize the DOM runtime

`packages/octane/src/runtime.ts` uses concrete DOM nodes, markers, namespaces,
HTML parsing, browser events, forms, portals, Activity hiding, hydration, head
management, and View Transitions. Its `Block` is not a neutral host record.

The Lynx implementation remains on the separate universal path. Any extracted
context, scheduler, or profiling primitive must be host-neutral and leave
normal DOM output and hot paths byte- and behavior-equivalent. Lynx-specific
conditionals do not belong in `runtime.ts`.

### Proposed package layout

```text
packages/lynx/
  README.md
  UPSTREAM.md
  status.json
  audit/upstream-crosswalk.json
  src/
    index.ts
    config.ts
    intrinsics.ts
    renderer.ts
    root.ts
    platform.ts
    testing.ts
    core/
      client-driver.ts
      host-driver.ts
      protocol.ts
      transport.ts
      props.ts
      styles.ts
      events.ts
      refs.ts
      lists.ts
      lifecycle.ts
      first-screen.ts
      worklets.ts
  tests/
    _fixtures/
    differential/
    rspeedy/
  typetests/

packages/rspeedy-plugin-octane/
  README.md
  src/
    index.ts
    plugin.ts
    entries.ts
    layers.ts
    compiler.ts
    css.ts
    template.ts
    refresh.ts
  tests/
```

The folder name can follow the repository's existing plugin naming convention;
the proposed published name is `@octanejs/rspeedy-plugin`.

Required `@octanejs/lynx` exports:

```text
@octanejs/lynx
@octanejs/lynx/config
@octanejs/lynx/renderer
@octanejs/lynx/intrinsics
@octanejs/lynx/intrinsics/jsx-runtime
@octanejs/lynx/platform
@octanejs/lynx/testing
```

## Host contracts

### Intrinsics and text

Adapt `@lynx-js/types` into a renderer-local `JSX.IntrinsicElements` namespace,
as `@octanejs/three/intrinsics` does. Do not import the upstream global React
JSX augmentation, and do not pollute DOM `.tsrx` files with Lynx tags.

The first supported intrinsic slice is:

- `page`, `view`, `text`, `raw-text`, `image`, and `scroll-view`;
- `input` and `textarea`;
- `list`, `list-item`, and list platform metadata; and
- arbitrary registered custom native element names through explicit module
  augmentation.

Primitive text lowers to a Lynx raw-text host only in a legal text context.
The compiler must reject text directly under `view` and other invalid parents
with an authored source location. `text: "host"` alone is too broad to express
this nesting rule, so the Lynx compiler specialization needs a contextual text
validator without changing DOM text lowering.

### Props, classes, CSS, styles, and assets

The host driver maintains the previous accepted prop bag for each logical host
and routes changes deliberately:

- `id` through the PAPI ID operation;
- `class` and `className` through Lynx class composition and class application;
- `style` through Lynx inline-style serialization/diffing;
- `data-*` through dataset application;
- event props through the event capability, never ordinary attributes;
- list metadata through the list capability; and
- remaining supported attributes through PAPI attribute operations.

CSS imports, CSS Modules, selector scoping, inheritance options, CSS custom
properties, assets, and entry/lazy-bundle CSS IDs remain owned by the Rspeedy
plugin and Lynx driver. The universal plan needs only the smallest static CSS
scope metadata required for the host to call the appropriate PAPI operation.
It does not gain a renderer-neutral CSSOM.

All transported prop values must pass Octane's structured-clone validator or a
Lynx resource codec. Functions, main-thread objects, native handles, and shared
mutable objects must not appear in a host batch.

### Events

Recognize the Lynx event grammar rather than `on[A-Z]`:

```text
[main-thread:] (bind | catch | capture-bind | capture-catch | global-bind) <event>
```

The background preview implements the unprefixed forms first. The driver maps
the prefix to the PAPI event kind and preserves the native event name. Event
payloads delivered to the background are JSON-like Lynx event data; they do not
expose a live main-thread `currentTarget`.

Initial priority guidance:

| Priority | Representative events |
| --- | --- |
| Discrete | `tap`, `longpress`, `touchstart`, `touchend`, `input`, `change`, `focus`, `blur` |
| Continuous | `touchmove`, `scroll`, `wheel`, `layoutchange` |
| Default | image load/error, animation/transition completion, appear/disappear, custom events unless declared otherwise |

The final catalogue is generated from the pinned upstream types and then
reviewed. `catch*` and capture/global behavior are expressed to Lynx through the
binding kind; Octane does not emulate propagation after delivery.

An event message is accepted only for the currently accepted root/version and
active listener. Replaced, removed, hidden, aborted, stale, or foreign handlers
must not run. A discrete event opens one Octane event scope, and all deliveries
for the native propagation path share that scope.

### Refs, measurement, and UI methods

Normal `ref` values live on the background thread and receive a stable
Octane-owned `NodesRef`/query handle after host acknowledgement. The handle may
select, measure, set native props, or invoke an element-specific UI method
through Lynx's asynchronous APIs; it is not a live `FiberElement`.

The universal core must not promise synchronous remote layout. If a reusable
capability is added, it is explicitly asynchronous and installs any cloned
public/layout snapshot before acknowledging the commit. Ref callbacks and
commit-ordered layout effects run only after that acknowledgement.

`main-thread:ref` and `useMainThreadRef()` are separate main-thread worklet
capabilities delivered with Milestone 7.

### Effects and lifecycle

All user effects execute in the background runtime. Main-thread first render
does not run insertion, layout, or passive effects.

On Lynx, `useInsertionEffect` and `useLayoutEffect` can preserve Octane's commit
ordering after a native acknowledgement, but they cannot synchronously block a
native paint or expose live remote layout. This is a documented platform
divergence. The package should emit a development diagnostic when code appears
to depend on synchronous measurement and direct authors to the async ref/query
API.

Root/page destruction must cancel queued work, reject future commits, detach
refs, remove listener tables, release resources, and make late acknowledgements
and native events harmless and diagnosable.

### Init data, global props, and native APIs

`@octanejs/lynx` supplies platform hooks comparable to the useful ReactLynx
surface:

- `useInitData()` and init-data change subscription;
- `useGlobalProps()` and global-props change subscription;
- `useLynxGlobalEventListener()`;
- `markFirstScreenSyncReady()` when manual handoff is supported; and
- typed access to the existing Lynx `lynx`, `NativeModules`, and platform
  globals through `@lynx-js/types`.

Native Modules stay background-thread-only. The compiler diagnoses statically
visible Native Module access from main-thread functions or first-render code.
Custom native elements remain host-registered Android/iOS/Harmony code; the
renderer provides types, authoring examples, and element transport, not a
second native module registry.

### Lists and recycling

Lynx `<list>` is not an ordinary scroll container. Native item creation,
recycling, list keys, item types, ref attach/detach, and visibility callbacks
form a distinct host contract.

Do not force list recycling through generic `insert`/`move` commands if that
causes eager native item allocation. Milestone 4 must determine the smallest
renderer-neutral collection capability, or keep a Lynx-namespaced encoded prop/
resource contract if no cross-renderer abstraction is justified. The Octane
`@for (...; key ...)` identity remains the logical source of truth.

The release oracle includes large-list memory, survivor identity, recycling,
reorder, event routing after reuse, and ref cleanup. A `scroll-view` fallback is
not list parity.

### Suspense, Activity, lazy bundles, and portals

The universal core already supplies retained Suspense, errors, visibility, and
same-renderer portals. The Lynx host must prove them rather than reimplement
them:

- a suspended render exposes no abandoned host mutation or leaked resource;
- retained content stays physically present and uses the native visibility
  contract;
- rejected transport preparation routes to the owning error boundary;
- a post-ACK native fault is reported as an accepted commit fault;
- lazy bundles integrate with Rspeedy chunk/template output; and
- portals target a root-scoped, serializable Lynx selector/handle and reject
  stale or foreign targets before mutation.

These are post-preview gates. The initial native preview may omit them, but its
status file and diagnostics must say so.

## ReactLynx migration and parity matrix

| ReactLynx surface | Octane/Lynx target | Disposition |
| --- | --- | --- |
| Function components, hooks, context | Octane universal runtime/compiler | Reuse Octane semantics |
| `root.render(<App />)` | `root.render(App, props?)` | Mechanical migration |
| `<view>`, `<text>`, `<image>`, scrolling/forms | Renderer-local Lynx intrinsics | Required for preview |
| CSS, CSS Modules, inline style, class names | Rspeedy CSS pipeline + Lynx host | Required for preview |
| `bind*`, `catch*`, capture/global events | Lynx event capability | Required for preview |
| Background `ref`/`NodesRef` | Acknowledgement-gated query handle | Required for preview |
| `useInitData`, global props/events | `@octanejs/lynx` platform hooks | Required for preview |
| `NativeModules` and `lynx` APIs | Existing Lynx globals with types/diagnostics | Required for preview |
| `<list>` recycling | Dedicated list/collection contract | Required before useful alpha |
| `useLayoutEffect` | Background commit-ordered effect; no paint blocking | Documented divergence |
| Class/PureComponent APIs | No Octane class components | Codemod diagnostic; no compatibility runtime |
| `forwardRef` | Ref is an ordinary prop in Octane | Mechanical migration + diagnostic |
| React rules of hooks | Compiler-assigned Octane slots; no plain JS loops | Intentional Octane divergence |
| Explicit dependency arrays | Accepted unchanged; omitted arrays inferred | Intentional Octane divergence |
| Main-thread scripts/worklets | Octane directives/worklet runtime | Post-preview, required for stable |
| `useMainThreadRef`, cross-thread calls | `@octanejs/lynx` main-thread APIs | Post-preview, required for stable |
| Instant first-frame render/handoff | Main render + background adoption protocol | Post-preview, required for stable |
| Lazy bundles/Suspense/portals | Universal semantics + Rspeedy/Lynx host proof | Post-preview |
| React/Preact implementation internals | None | Out of scope |

Add a migration tool only after the authored API is stable. Its transformations
should include:

- rename selected `.tsx` modules to `.tsrx`;
- replace framework imports;
- convert `root.render(<App />)` to component-form rendering;
- keep Lynx intrinsic/event/style spelling;
- turn `forwardRef` into a normal `ref` prop;
- flag class components, render side effects, DOM globals, unsupported main-
  thread APIs, and hooks inside plain JavaScript loops; and
- produce a report for cases that cannot be changed safely.

## Delivery milestones and exit gates

### Milestone 0 — upstream pin and real-engine spike (1–2 engineer-weeks)

- Pin one exact, published Lynx SDK, Rspeedy, template plugin, types package,
  and `@rsbuild/core` compatibility set plus its source commit.
- Create `packages/lynx/audit/upstream-crosswalk.json` covering ReactLynx public
  exports and executable behavioral tests. Classify each as port, differential,
  intentional divergence, deferred milestone, or out of scope with a durable
  reason.
- Confirm the public framework hooks for:
  - installing a custom main-thread lifecycle receiver;
  - creating/mutating/flushing Element PAPI nodes;
  - sending a background commit and returning an acknowledgement;
  - registering a native event handler token and delivering its payload back to
    the background runtime; and
  - page destroy, reload, init data, and global props.
- Produce a throwaway or committed probe that renders `view > text`, applies one
  background state update, handles one tap, and tears down.
- Encode a production `.lynx.bundle` and run it in the official JavaScript test
  environment, Lynx Web/Explorer, Android, and iOS.
- Record ReactLynx and imperative-PAPI baselines for first paint, background
  update, patch bytes, one commit flush, minimal bundle bytes, and teardown.
  Ratify numeric regression budgets from evidence rather than guessing them in
  this document.

Exit: the engine accepts an Octane-owned PAPI tree and one acknowledged
background patch without importing React/Preact; Android and iOS display and
update the same public tree; the exact supported upstream set and framework
extension APIs are documented. If a required lifecycle/event hook is private or
unstable, stop and upstream a framework-neutral hook before building the port.

### Milestone 1 — native-safe universal core and package scaffolding (2–3 engineer-weeks)

- Scaffold `@octanejs/lynx` and `@octanejs/rspeedy-plugin` with package exports,
  licenses, `UPSTREAM.md`, status/crosswalk checks, renderer config, intrinsics,
  type tests, and pack fixtures.
- Split or tree-shake the universal runtime so the background native entry has
  no DOM initialization and the future PrimJS main entry cannot pull in
  `runtime.ts`. Keep DOM and Three behavior/output unchanged.
- Add thread/runtime compile metadata without adding a new renderer resolver:
  `renderer: lynx` still selects the universal compiler target, while the
  Rspeedy layer selects `main-thread` or `background` specialization.
- Prove ES target lowering and available built-ins for both Lynx runtimes.
- Add renderer-local intrinsic types without global React/DOM JSX pollution.
- Add compiler diagnostics for illegal text nesting, residual JSX, DOM globals,
  and unsupported host props with authored source locations.

Exit: a compiled `.lynx.tsrx` module can be bundled for the background runtime;
its dependency graph contains no React, Preact, ReactLynx runtime, or DOM-only
Octane entry; existing DOM and Three compiler/runtime suites remain unchanged.

### Milestone 2 — background root, PAPI driver, and async transport (2–3 engineer-weeks)

- Implement page/root bootstrap and the background client driver.
- Implement the main PAPI receiver for create, update, recreate, insert, move,
  remove, destroy, visibility, and one flush per accepted batch.
- Map transported logical IDs to host nodes without consulting mutable global
  renderer state.
- Implement validation/staging before mutation, ACK at the irreversible host
  acceptance point, abort before ACK, rejection, post-ACK fault reporting,
  version ordering, and async unmount.
- Install cloned public ref/query handles before acknowledgement.
- Exercise keyed `@for`, components, fragments, conditionals, state updates,
  context, refs, effects, error boundaries, and teardown.

Exit: counter and keyed-list-shaped fixtures mount, update, reorder, and unmount
in the official Lynx testing environment; surviving host identity is retained;
pre-ACK failure exposes no public mutation; post-ACK faults are reported once;
late ACKs/events and stale roots are rejected.

### Milestone 3 — text, props, CSS, assets, events, refs, and core elements (3–5 engineer-weeks)

- Implement the first intrinsic slice and legal raw-text lowering.
- Implement attribute removal, class composition, datasets, inline styles, CSS
  IDs/scopes, CSS Modules, supported units, and asset/resource encoding.
- Add image load/error, text, scroll view, input, and textarea behavior.
- Implement background bind/catch/capture/global event kinds, priorities,
  replacement/removal, native payloads, and event-scope batching.
- Implement background `NodesRef`, query, asynchronous measure, UI method
  invocation, ref churn on recreation, and cleanup.
- Add visibility for retained Activity/Suspense content.

Exit: equivalent Octane and pinned ReactLynx fixtures produce the same
normalized public host tree, style/class state, event log, form/scroll behavior,
ref-visible identity, and cleanup—or carry a passing `OCTANE DIVERGENCE`
contract. No test uses private snapshot fields or command order as its oracle.

### Milestone 4 — lists, page APIs, and native capability boundary (2–4 engineer-weeks)

- Implement native list item types, keys, recycling, native callbacks, attach/
  detach refs, item reuse, reorder, and destruction.
- Add init data, global props, global events, page reload/destroy, lifecycle and
  error reporting.
- Type Native Modules and diagnose thread misuse. Add one Android and one iOS
  native module example plus one custom native element fixture; do not ship
  application-native code inside the renderer.
- Prove custom intrinsic module augmentation and serializable resource handles.
- Decide and document the initial portal, Suspense, lazy-bundle, gesture, and
  animation exclusions.

Exit: a realistically large recycled list preserves item/event/ref correctness
and bounded native allocation while scrolling; init/global data updates render;
the sample native module and custom element work on Android and iOS; teardown
leaves no native nodes, listeners, callbacks, or resource handles.

### Milestone 5 — Rspeedy production path and technical preview (2–3 engineer-weeks)

- Finish `@octanejs/rspeedy-plugin` using framework-neutral Lynx template, CSS,
  runtime-wrapper, and encoding packages.
- Produce development and production background/main receiver graphs, CSS and
  asset sections, source maps, debug metadata, HMR/live reload, and a
  `.lynx.bundle` per entry.
- Preserve Octane's shared renderer resolver and cache keys.
- Add `@octanejs/lynx/testing` over `@lynx-js/testing-environment`, production
  bundle smoke tests, a packed external consumer, and device error capture.
- Document setup, supported engine/platform range, native event spelling,
  lifecycle differences, list support, native modules, and preview exclusions.
- Add changesets and repository inventory/bindings metadata.

Exit: a packed external app builds and runs in Lynx Web, Android Explorer, and
iOS Explorer; taps, input, scrolling, list recycling, native module calls,
global props, errors, reload, and teardown work; source maps resolve to authored
`.tsrx`; HMR leaves no stale host or listener state; the production graph has no
React/Preact. Publish only as a **background-rendered technical preview**.

### Milestone 6 — main-thread first paint and background adoption (4–7 engineer-weeks)

- Add a PrimJS-safe, render-only main-thread specialization and automatic DCE
  for effects, ordinary handlers, background-only functions, and unused imports.
- Compile the same entry for main and background runtimes with identical init
  data and deterministic plan metadata.
- Implement serializable first-tree snapshots, logical ID seeding/mapping,
  background adoption, event buffering/replay, manual/automatic sync timing,
  mismatch repair/diagnostics, reload, and teardown.
- Ensure only the background runtime publishes effects, refs, state ownership,
  and later updates.
- Test early returns, conditional hooks, context, keyed lists, errors,
  suspension, differing init data, non-deterministic render code, and background
  startup failure.

Exit: the first native frame is painted before the background runtime is ready;
the background root adopts the same native node identities without duplicate
allocation; ordinary events survive handoff; main-only side effects never run;
mismatches are repaired or diagnosed deterministically. At this point Octane
may claim Lynx IFR support.

### Milestone 7 — main-thread scripts, refs, and cross-thread calls (4–6 engineer-weeks)

- Support `'main thread'` and `'background only'` directives, including import
  DCE and source-attributed diagnostics.
- Implement `main-thread:` event/ref props, serializable capture analysis,
  worklet identity/lifetime, and `useMainThreadRef()`.
- Implement `runOnMainThread()` and `runOnBackground()` with async return values,
  errors, cancellation, stale-root protection, and calls made before adoption.
- Decide from the Milestone 0 pin whether to reuse a stable framework-neutral
  Lynx worklet transform/runtime protocol or implement the transformation in
  Octane. Do not depend on the ReactLynx component runtime.
- Add gestures, high-frequency main-thread element operations, and animation
  examples only through documented Lynx APIs.

Exit: tap/scroll/gesture handlers run on the main thread without background
round trips; captured values are validated and isolated; main-thread refs point
to the adopted native nodes; bidirectional calls return values/errors exactly
once; removed or reloaded worklets cannot run.

### Milestone 8 — Suspense, lazy bundles, portals, scheduling, and HMR (3–5 engineer-weeks)

- Prove retained Suspense/errors/Activity through first render, adoption, later
  updates, transport rejection/fault, and visibility changes.
- Integrate Rspeedy lazy bundles and dynamic imports without serial waterfalls.
- Add same-root Lynx portals if a serializable target contract is available.
- Fill universal scheduler gaps required by the supported public surface,
  including real transition pending/deferred behavior and justified `memo`
  bailouts. Do not promise unsupported APIs merely because ReactLynx names
  React.
- Define compatible versus reconstructing HMR for main snapshots, background
  state, host identity, listeners, worklets, resources, and list items.

Exit: no suspended or abandoned attempt mutates the native tree; accepted
content, fallbacks, errors, lazy chunks, portals, transitions, and HMR have
observable behavioral tests; stale work/resources are released across both
runtimes.

### Milestone 9 — parity and release stabilization (2–3 engineer-weeks)

- Complete the upstream export/test crosswalk with zero unclassified cases.
- Run minimum and current supported Lynx/Rspeedy/engine lanes.
- Promote Android and iOS device tests to release-required status.
- Establish semantic-checksummed performance and bundle-size ratio guards for
  preview and IFR modes.
- Complete API review, public docs, migration diagnostics/tooling, pack checks,
  license/NOTICE review, status metadata, generated package/binding inventory,
  and patch changesets.
- Decide whether evidence from Three plus Lynx is sufficient to stabilize the
  universal renderer ABI; do not make that decision from API aesthetics alone.

Exit: every supported ReactLynx behavior is covered or explicitly documented;
no committed test is skipped, todo, or expected-failure; packed apps build and
run on the stated minimum/current toolchains and Android/iOS runtimes; public
performance, lifecycle, event, ref, and native capability claims have durable
evidence.

## Validation strategy

Tests follow the repository's observation-boundary rule: assert what a native
application observes, not the private route used to produce it.

### Compiler and configuration

- Renderer resolution for standalone and `*.lynx.tsrx` modes.
- Renderer-local JSX namespace and custom intrinsic augmentation.
- Main/background specialization, source maps, diagnostics, HMR and production
  compile modes.
- Illegal text nesting, unsupported attributes, DOM globals, thread-only API
  misuse, nonserializable worklet captures, and double-run side effects.
- Existing DOM emitted behavior and Three compilation remain unchanged.

Raw output checks are limited to public module/export shape, source-map mapping,
and published diagnostics. Bundle/codegen size belongs in benchmarks.

### Driver and official JavaScript environment

Use `@lynx-js/testing-environment` for deterministic main/background globals and
Element PAPI. Through public `@octanejs/lynx` entry points, assert:

- visible native tree, attributes, classes, inline/computed style where exposed,
  text, assets, and accessibility state;
- node identity across keyed updates and adoption;
- event payload/order/propagation, listener replacement, discrete batching, and
  stale-event rejection;
- ref/query/UI-method behavior and cleanup;
- list recycling and bounded public allocation;
- effects, errors, visibility, suspension, init/global data, reload, and
  teardown; and
- rejection/fault behavior at the host acceptance boundary.

Only transport protocol tests pin wire identity, serialization, versioning,
acknowledgement, rejection, fault, and teardown messages. Normal correctness
tests do not assert command arrays, private IDs, or exact internal call order.

### Differential oracle

Run equivalent scenarios through:

- Octane plus `@octanejs/lynx`; and
- the pinned ReactLynx plus its official testing library/environment.

Drive the same init/global data and native events, then compare a normalized
public host-tree and event/effect/ref log after each step. Add focused identity,
layout, recycling, timing, or cleanup assertions when serialization cannot
observe the contract. Intentional differences are ordinary passing tests with
an `OCTANE DIVERGENCE` explanation.

### Rspeedy and package tests

- Development and production `.lynx.bundle` builds.
- Main/background chunk graph, template/CSS/assets, source maps, HMR/live reload,
  and lazy bundles when supported.
- Dependency-graph assertion excluding React, Preact, and ReactLynx runtime.
- Packed external consumer using published subpaths and one resolved
  `@rsbuild/core`/Rspeedy graph.
- Public/type export matrix for intrinsics, events, style, refs, Native Modules,
  global props, custom elements, platform APIs, and testing.

### Native platform matrix

| Lane | Technical preview | Stable release |
| --- | --- | --- |
| JavaScript Lynx environment | PR-required | PR-required |
| Production Lynx Web bundle | PR-required | PR-required |
| Android emulator/Explorer | Nightly, release-required | PR or merge-queue + release-required |
| iOS simulator/Explorer | Nightly, release-required | PR or merge-queue + release-required |
| Minimum supported upstream set | Release-required | PR/merge-queue + release-required |
| Current upstream set | Nightly | Nightly + release-required |
| HarmonyOS | Informational until automated | Required only if advertised |

Missing native binaries or simulator images fail with an actionable setup
command; they do not silently skip. A browser mock is not evidence for a native
layout, list, worklet, or module claim.

### Benchmarks and budgets

Compare Octane/Lynx, pinned ReactLynx, and imperative Element PAPI with semantic
checksums for:

- minimal bundle and representative app bundle bytes by thread/section;
- first frame, background readiness, and adoption latency;
- mount/update/unmount of 1,000 simple hosts;
- keyed reorder and native host moves;
- large-list scroll/recycling and steady-state memory;
- discrete tap and continuous scroll event latency;
- style/class updates, input, image, and async measurement;
- patch bytes, serialization/parse/apply time, batches and host flushes; and
- repeated reload/mount/unmount resource and listener retention.

Milestone 0 records the first comparable baselines and commits conservative
thresholds with the benchmark harness. Every performance test verifies final
tree/state/event semantics so a no-op or dropped update cannot win. Later
milestones may tighten a threshold only from repeated comparable evidence.

## Repository and release wiring

Implementation PRs must account for repository-wide generated and hard-coded
inventory:

- add both packages to the workspace catalogs and lockfile;
- classify the Rspeedy plugin under `SPECIAL_ROLES` and, if required,
  `OCTANE_SINGLETON_CONSUMERS` in `scripts/workspace-packages.mjs` so it is not
  mistaken for a binding;
- add package tsconfigs to the root hard-coded `typecheck` script;
- add Vitest projects, aliases, environments, and renderer subpaths;
- add a Lynx-specific packed external consumer to
  `scripts/check-package-packs.mjs`;
- add `packages/lynx/status.json`, `UPSTREAM.md`, the checked crosswalk, and
  crosswalk validation;
- update `website/src/content/bindings.json`, run `pnpm bindings:status`, and run
  `pnpm packages:inventory` for `docs/packages.md`;
- add required native/release jobs to CI and to the publish workflow's named
  status requirements;
- retain Apache-2.0 copyright/license/NOTICE and modification notices for any
  adapted Lynx source; prefer public package APIs over copied code;
- add patch changesets for user-facing package/compiler behavior; and
- always run repository-wide `pnpm format:check` after file changes, plus the
  smallest relevant tests and typecheck/build/device gates for the milestone.

The first native sample belongs under the package's Rspeedy fixtures. The
current examples catalogue and E2E runner assume web modes; add a `native` mode
only with an explicit schema and native runner instead of disguising a Lynx app
as a browser example.

## Risks and decision deadlines

| Risk | Required mitigation | Decision gate |
| --- | --- | --- |
| Framework lifecycle/event hooks are private or React-specific | Prove public extension points or upstream a framework-neutral API before porting | Milestone 0 |
| `universal.ts` pulls DOM runtime into native/PrimJS bundles | Extract a host-neutral native entry and protect DOM/Three output with tests/size baselines | Milestone 1 |
| Rspeedy and Octane resolve incompatible Rsbuild/Rspack copies | Pin one tested graph; reject duplicate-core configurations with a diagnostic | Milestone 0–1 |
| PAPI or template formats change across fast-moving 0.x releases | Exact initial pin, crosswalk, minimum/current lanes, protocol feature detection | Milestone 0 and 9 |
| Generic host commands cannot express list recycling efficiently | Dedicated spike and capability; do not ship list as an eager scroll-view alias | Milestone 4 |
| Main/background initial renders diverge or run side effects twice | Thread DCE, deterministic snapshot metadata, diagnostics, mismatch repair, differential tests | Milestone 6 |
| Main-thread worklet compiler/runtime is ReactLynx-private | Audit reusable public protocol or implement Octane transform; never import the Preact runtime | Milestone 0 and 7 |
| CSS scope, inheritance, or assets depend on React transforms | Drive framework-neutral CSS/template hooks and carry explicit plan metadata | Milestone 1–3 |
| Remote refs imply synchronous native objects/layout | Public async handles and ACK-installed snapshots; no synchronous measurement claim | Milestone 2–3 |
| Native fault after ACK corrupts logical state | Preserve the universal accepted-fault contract, report once, and require deterministic teardown/recovery | Milestone 2 |
| Native `tasm` binaries exclude contributor/CI platforms | Document supported hosts; add build-from-source or remote/native CI policy | Milestone 0–1 |
| Apache-2.0 source is copied into MIT packages incorrectly | Dependency-first design, `UPSTREAM.md`, retained notices, release license review | Every port PR |

## Effort and critical path

- **Background-rendered native technical preview:** approximately **9–14
  engineer-weeks** for one experienced engineer. Two engineers can overlap the
  driver/toolchain work with intrinsics/events/testing after Milestone 1.
- **IFR plus main-thread capabilities and stable core parity:** approximately
  **22–36 engineer-weeks total**. Milestones 6 and 7 carry the widest uncertainty
  because they require a dual-runtime compiler/bootstrap/adoption design, not
  merely another host driver.
- **Two experienced engineers:** a reasonable confidence range is **12–20
  calendar weeks** from an accepted Milestone 0 contract to a release candidate,
  assuming Android/iOS infrastructure and upstream framework hooks are
  available.
- HarmonyOS release support, broad custom native component libraries, React
  class compatibility, and an entire ReactLynx ecosystem port are not included.

These are confidence ranges, not the sum of every milestone maximum. Evidence,
crosswalk, documentation, device automation, and pack checks run continuously;
deferring them to Milestone 9 adds time rather than saving it.

The hard dependency chain is:

```text
public Lynx framework hooks and version pin
    → native-safe universal entry
    → background client + PAPI receiver + ACK
    → props/styles/events/refs
    → native list + page/native capability boundary
    → production Rspeedy bundle
    → background-rendered technical preview
    → main-thread render + first-tree snapshot
    → background adoption and event handoff
    → main-thread worklets/cross-thread calls
    → advanced semantics and stable release
```

After the Milestone 1 contracts are fixed, intrinsic/types work, driver/PAPI
work, Rspeedy packaging, and test infrastructure can proceed in parallel. IFR
cannot proceed responsibly until the background host tree and transport have
already proven stable identities, acknowledgement, event delivery, and
teardown.

## Definition of done

Octane has genuine Lynx native capability when all of the following are true:

- a normal Octane `.tsrx` application builds into a production `.lynx.bundle`
  without React, Preact, or ReactLynx runtime code;
- Android and iOS render real Lynx native elements with correct text, CSS,
  assets, input, scrolling, recycled lists, accessibility props, native events,
  refs/UI methods, init/global data, Native Modules, custom elements, errors,
  reload, and teardown;
- the main thread paints the first screen before background readiness, and the
  background root adopts the exact surviving native node identities;
- ordinary background events and main-thread worklet events behave correctly
  before, during, and after ownership handoff;
- effects and thread-only APIs follow one documented Lynx contract with
  compiler diagnostics for unsafe uses;
- every accepted commit is atomic at the host boundary, stale events/work are
  rejected, and abort/fault/unmount leak no nodes, listeners, refs, worklets, or
  resources;
- the supported ReactLynx public/test crosswalk has zero unclassified entries
  and every divergence is intentional, documented, and tested;
- minimum/current toolchain lanes, official JavaScript environment tests,
  Android/iOS native gates, type/package/pack checks, semantic benchmarks, and
  repository-wide formatting all pass; and
- the package status and release notes state exactly which Lynx engine,
  platforms, elements, events, lifecycle APIs, main-thread capabilities, and
  advanced features are supported.

