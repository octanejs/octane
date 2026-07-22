# Lynx native renderer and ReactLynx migration plan

Status: **Milestone 0 blocked; Milestones 1–2 implemented; Milestones 3–8 have private source/test/build implementations but their formal exits remain blocked**

Upstream audit date: **2026-07-18**

Milestone 1 evidence date: **2026-07-19**

Milestone 2 source/test evidence date: **2026-07-19**

Milestone 3 source/test evidence date: **2026-07-19**

Milestone 4 source/test evidence date: **2026-07-19**

Milestone 5 source/build evidence date: **2026-07-20**

Milestone 6 source/build evidence date: **2026-07-21**

Milestone 7 source/test evidence date: **2026-07-21**

Milestone 8 source/test/build evidence date: **2026-07-22**

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
	capabilities: ['class-name-alias', 'visibility'],
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
- main-thread first rendering and adoption; main-thread worklets and
  cross-thread function calls remain a later milestone.

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
| Lynx native SDK | `3.9.0` (target `3.9`) | Exact Android/iOS engine and Explorer gate |
| `@lynx-js/react` | `0.123.0` | Behavioral oracle, public API/test crosswalk, no production dependency |
| `@lynx-js/react-rsbuild-plugin` | `0.18.0` | Reference for dual-layer graph and lifecycle wiring only |
| `@lynx-js/rspeedy` | `0.16.0` | Native toolchain and public plugin host |
| `@lynx-js/template-webpack-plugin` | `0.13.0` | Framework-neutral `.lynx.bundle` assembly |
| `@lynx-js/css-extract-webpack-plugin` | `0.9.0` | Framework-neutral stylesheet extraction |
| `@lynx-js/runtime-wrapper-webpack-plugin` | `0.2.2` | Background runtime wrapping |
| `@lynx-js/webpack-dev-transport` | `0.3.0` | Development transport wiring; not runtime HMR evidence |
| `@lynx-js/tasm` | `0.0.39` | Native bundle encoding and test decoding |
| `@lynx-js/testing-environment` | `0.3.0` | Pure-JavaScript source testing environment |
| `@lynx-js/types` | `4.0.0` | Source intrinsic/event/platform types to adapt renderer-locally |
| `@lynx-js/web-core` | `0.22.2` | Exact Web control; execution currently blocked |
| `@rsbuild/core` | `2.1.4` | Exact core selected by Rspeedy `0.16.0` |
| `@rspack/core` | `2.1.3` | Exact bundler core selected by the Lynx compatibility set |

The immutable compatibility record began with the Phase 0 SDK/probe pins and
now records the Milestone 5 CSS and development-transport additions with their
registry integrity. Milestone 5 consumes the exact package versions above as
one physical compatibility graph. This is not a minimum-to-current support range. The
remaining Milestone 0 exit also requires the public runtime hooks and execution
evidence described below. Minimum/current lanes are added only after the private
source/build path works in the required engines.

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

The host-neutral root uses the standard `queueMicrotask` global when one is
available and otherwise requires `UniversalRootOptions.scheduleMicrotask`.
The future Lynx root supplies that option from `lynx.queueMicrotask`; the core
does not turn thrown scheduler callbacks into Promise rejections.

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
    main-renderer.ts
    root.ts
    first-screen.ts
    main-thread.ts
    platform.ts
    testing.ts
    core/
      client-driver.ts
      host-driver.ts
      papi.ts
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
@octanejs/lynx/main-renderer
@octanejs/lynx/first-screen
@octanejs/lynx/intrinsics
@octanejs/lynx/intrinsics/jsx-runtime
@octanejs/lynx/main-thread
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
- typed access to the existing Lynx `lynx`, `NativeModules`, and platform
  globals through `@lynx-js/types`.

The private Milestone 4 source implements those background data hooks, the
global-event hook, typed `lynx`/`NativeModules` access, `reportError()`, and a
request-only `reload()` wrapper over the public background API. Init-data hooks
seed from public `__presetData` and consume the framework-maintained current
`__initData` snapshot when available; tests cover RESET key removal and the
render-to-layout subscription race. The native update receiver that maintains
that current snapshot is still uninstalled and remains part of the formal
device gate. The source also does not install a framework reload or page-destroy
receiver. Milestone 6 now supplies `markFirstScreenSyncReady()` as the explicit
main-entry initialization gate before a first-tree snapshot is offered to the
background runtime. This source contract has not been exercised by a native
lifecycle receiver.

Native Modules stay background-thread-only. The compiler diagnoses statically
visible Native Module access and `@octanejs/lynx/platform` imports from
main-thread functions or first-render code. `createLynxRoot()` separately checks
the public background-only `lynx.getJSModule()` surface before connecting its
transport.
Custom native elements remain host-registered Android/iOS/Harmony code; the
renderer provides types, authoring examples, and element transport, not a
second native module registry.

### Lists and recycling

Lynx `<list>` is not an ordinary scroll container. Native item creation,
recycling, list keys, item types, ref attach/detach, and visibility callbacks
form a distinct host contract.

Do not force list recycling through generic `insert`/`move` commands if that
causes eager native item allocation. Milestone 4 keeps item virtualization in
the Lynx host because the public `__CreateList`, `__UpdateListComponents`, and
`__UpdateListCallbacks` contract is renderer-specific. The host stores logical
`list-item` descriptors, materializes a physical cell only when Lynx requests
an index, and partitions reuse by `reuse-identifier`. The Octane
`@for (...; key ...)` identity and the mandatory unique `item-key` remain the
logical source of truth. Nested `<list>` hosts are rejected during batch
preparation in the initial contract rather than entering a partially supported
recycling path.

`reuse-identifier` accepts strings. Omitting it or passing an empty string
selects the default reuse pool; it is not an alias for Octane's logical key.

Only physical host attachment is generalized. An optional universal host
capability reports attach/detach changes so normal refs are installed when a
recycled tree becomes physical and cleared when Lynx recycles it. Drivers that
do not implement the capability keep the existing always-attached behavior.
This capability does not expose list operations or synchronous native layout.

The source/test lane covers a 1,000-item logical list with demand
materialization, native cell identity reuse, reorder, attachment ordering, and
inert callbacks after teardown in the official JavaScript environment. A
deterministic fake-PAPI benchmark holds a 12-cell visible window to 12 physical
cell roots versus 1,000 in its eager reference, records 988 reuses and zero
remaining cells after teardown, and protects that source-level allocation ratio
at 0.02 or below. That is not Android/iOS native allocation, scrolling, layout,
steady-state memory, or timing evidence. A `scroll-view` fallback is not list
parity.

Boolean `defer` is accepted and forwarded as list metadata, but it does not
cause callback-demanded materialization: every item in this initial
background-rendered host is callback-demanded regardless of that prop. This is
not full ReactLynx `defer` parity. Its
`defer={{ unmountRecycled: true }}` lifecycle mode is also excluded initially:
a recycled cell detaches refs but does not unmount the logical Octane subtree
or run component/effect cleanup merely because it left the native viewport.

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

> **Progress (2026-07-19): implemented.** The private Lynx and Rspeedy packages,
> DOM-free native universal entry, renderer diagnostics, exact dual-thread
> production compile graphs, runtime-compatibility evidence, and packed external
> consumer are in place. This satisfies the build/source exit gate only;
> Milestone 0's public lifecycle/event and real-device gates remain blocked, so
> this is not a native preview and does not claim `.lynx.bundle` execution.

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

> **Progress (2026-07-19): private source/test implementation complete; exit
> blocked.** The background root/client driver, named-`ContextProxy` transport,
> root-scoped main-thread PAPI receiver, cloned ACK-gated handles, accepted-fault
> cleanup, and asynchronous unmount are implemented. Compiled counter/keyed-list
> fixtures pass in the official JavaScript environment, including retained host
> identity, pre-ACK no-mutation rejection, one post-ACK fault, version gaps, late
> messages, stale roots, effects/refs/errors, and teardown. This does not waive
> Milestone 0's missing public native event/lifecycle/reload hooks or Web,
> Android, and iOS gates; there is still no production `.lynx.bundle` or native
> preview claim.

- Implement page/root bootstrap and the background client driver.
- Implement the main PAPI receiver for create, update, recreate, insert, move,
  remove, destroy, visibility, and one flush per accepted batch.
- Map transported logical IDs to host nodes without consulting mutable global
  renderer state.
- Implement validation/staging before mutation, ACK at the irreversible host
  acceptance point, abort before ACK, rejection, post-ACK fault reporting,
  version ordering, and async unmount.
- Install cloned public identity handles before acknowledgement; query methods
  remain Milestone 3 work.
- Exercise keyed `@for`, components, fragments, conditionals, state updates,
  context, refs, effects, error boundaries, and teardown.

Exit: counter and keyed-list-shaped fixtures mount, update, reorder, and unmount
in the official Lynx testing environment; surviving host identity is retained;
pre-ACK failure exposes no public mutation; post-ACK faults are reported once;
late ACKs/events and stale roots are rejected.

### Milestone 3 — text, props, CSS, assets, events, refs, and core elements (3–5 engineer-weeks)

> **Progress (2026-07-19): host-side private source/test implementation
> complete; formal exit blocked.** Legal raw-text contexts, deliberate
> prop/class/style/dataset/CSS-scope/asset routing, background native-event
> tokens and priority scopes, acknowledgement-gated asynchronous NodesRef
> handles, core-element PAPI creation, and retained visibility are implemented
> and covered by unit or official-JavaScript-environment tests. This is not the
> Milestone 3 exit: `__AddEvent` publicly installs tokens, but production native
> delivery still depends on the private `lynxCoreInject.tt.publishEvent`
> receiver; CSS import/CSS Module extraction and template/asset assembly remain
> Milestone 5 work; the testing environment cannot prove dataset-key deletion
> or native query/layout behavior; and no pinned ReactLynx differential has run
> on Explorer, Android, or iOS.

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

> **Progress (2026-07-19): private source/test implementation complete for the
> selected initial surface; formal exit blocked.** The Lynx-specific list host
> uses public list callbacks to materialize and recycle physical cells on
> demand, preserves logical keyed identity, and routes physical attach/detach
> through an optional universal ref capability. Host-side tests exercise 1,000
> logical items, reuse, reorder, ref attachment messages, teardown, and
> root-scoped resource handles. A semantic-checksummed source-level benchmark
> guards a 12-cell window against an eager 1,000-cell reference. The background
> platform hooks cover init data, global props/events, typed Native Modules,
> reload requests, and error reporting; the compiler rejects statically visible
> platform imports and Native Module access in main-thread specialization, while
> `createLynxRoot()` runtime-checks background ownership through the public
> `lynx.getJSModule()` surface. App-owned Android/iOS module and custom
> element examples document the intended seam but have not run on devices.
> Formal exit remains blocked on Android/iOS allocation, scroll, module,
> element, lifecycle, and teardown evidence; a public native event, destroy,
> and reload receiver; and the existing Milestone 0 gates. The initial slice
> excludes nested lists, portals, Lynx Suspense proof, lazy bundles, gestures,
> animations, full boolean-`defer` parity, and `defer.unmountRecycled`
> semantics.

- Implement native list item types, keys, recycling, native callbacks, attach/
  detach refs, item reuse, reorder, and destruction.
- Add init data, global props, global events, page reload/destroy, lifecycle and
  error reporting. A public reload request is not evidence for the still-missing
  framework reload/destroy receiver.
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

### Milestone 5 — Rspeedy production path toward technical preview (2–3 engineer-weeks)

> **Progress (2026-07-20): private source/build implementation complete; formal
> exit blocked.** With `thread` omitted, `pluginOctane()` now treats every
> authored entry as an application: the authored code becomes the background
> graph and an internal entry installs the Octane main-thread receiver. The
> plugin uses the pinned framework-neutral template, CSS extraction,
> runtime-wrapper, development transport, and native encoder packages to emit a
> `.lynx.bundle` per entry while retaining Octane's shared renderer resolver and
> cache identities. Explicit `thread: 'background'` and
> `thread: 'main-thread'` remain isolated compiler-graph diagnostic modes. The
> public `@octanejs/lynx/testing` subpath is now a thin facade over the pinned
> JavaScript testing environment, and production smoke evidence builds and
> decodes the bundle without a React, Preact, or ReactLynx runtime. This does not
> itself establish main-thread rendering or first-paint adoption; those now
> have separate Milestone 6 source/build evidence. No Lynx Web, Android, or iOS
> execution; device error capture; authored-source-map resolution in an engine;
> or state-preserving HMR evidence has landed. The packages therefore remain
> private and are not a technical preview.

Both packages already appear in the generated private-package inventory. The
public bindings-status generator intentionally excludes private packages, so
`packages/lynx/status.json` remains the machine-readable status source without
a public website binding entry. A release changeset is deferred until the
packages are eligible to publish.

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

> **Progress (2026-07-21): private source/build implementation complete; formal
> exit blocked.** Rspeedy application mode now builds the same authored entry
> in two Rspack layers. The generated main graph installs the receiver, resolves
> the exact `@octanejs/lynx` package root to a synchronous first-screen facade,
> runs authored imports through a PrimJS-safe one-shot renderer, and releases an
> explicit manual synchronization gate after synchronous initialization. The
> main renderer emits deterministic initial host IDs and event markers without
> publishing effects, refs, state ownership, or later updates; the background
> graph retains the full Octane runtime. A clone-safe snapshot and opaque local
> journal support compatible transfer without host allocation or structural
> mutation, FIFO ordinary-event replay after background listener ownership,
> typed deterministic mismatch repair, and teardown. Source, compiler, graph,
> and official-JavaScript-host tests cover these contracts. Native list hosts,
> list materializations, and background-root-scoped native-resource props
> remain excluded from first-tree capture, and boolean `defer` keeps only its
> Milestone 4 metadata behavior. There is no Lynx Web,
> Explorer, Android, or iOS proof of first paint, native node identity, or
> handoff, and no native performance evidence. The formal exit and IFR claim
> therefore remain blocked.

- Add a PrimJS-safe, render-only main-thread specialization and automatic DCE
  for effects, ordinary handlers, background-only functions, and unused imports.
- Compile the same entry for main and background runtimes with identical init
  data and deterministic plan metadata.
- Implement serializable first-tree snapshots, logical ID seeding/mapping,
  background adoption, event buffering/replay, manual/automatic sync timing,
  mismatch repair/diagnostics, reload, and teardown.
- Give boolean list-item `defer` its ReactLynx eager-main versus
  deferred-background meaning, if native evidence supports retaining that API;
  Milestone 4 only forwards the metadata.
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

> **Progress (2026-07-21): private source/test implementation complete; formal
> exit blocked.** The Octane universal compiler now recognizes leading
> `'main thread'` and `'background only'` function directives for renderers that
> opt into thread functions. It assigns source-stable IDs, removes
> opposite-layer definitions and imports, serializes captures in deterministic
> order, and reports source-attributed diagnostics for unsupported placement,
> captures, hooks, async main-thread functions, `this`, JSX, and unavailable
> layer imports.
> `@octanejs/lynx` owns the descriptor registries, capture isolation, activation
> and ref lifetimes, host prop/event/ref routing, and root-scoped bidirectional
> call protocol. Main-thread event props use the pinned Lynx-compatible worklet
> envelope, while refs are updated only with main-local Element PAPI nodes.
> Calls support pre-adoption queuing, async values/errors, cancellation,
> exactly-once settlement, and stale-root plus active/retained
> definition-revision rejection. Raw descriptors that were never activated or
> retained, removed module sites, and end-to-end runtime HMR remain Milestone 8
> work. No ReactLynx component, Preact, transform, or worklet runtime is a
> dependency. Compiler, protocol, driver, and official-JavaScript-host tests
> cover those boundaries, but there is no Lynx Web, Explorer, Android, or iOS
> proof that worklets execute on the native main thread, refs retain the adopted
> native identity, or gestures and continuous events avoid a background round
> trip. There is also no native latency, memory, or cleanup benchmark, so the
> formal Milestone 7 and stable/IFR gates remain blocked.

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

> **Progress (2026-07-22): private source/test/build implementation complete;
> formal exit blocked.** The host-neutral runtime now caches renderer-checked
> lazy components, starts compiler-proven independent lazy trees in one warm
> stratum, retains accepted content across suspending transition work, publishes
> transition pending state, defers preview/final values, and applies conservative
> owner-local `memo()` bailouts that invalidate for local updates and observed
> context. The Lynx first-screen specialization can synchronously commit authored
> pending/catch arms, while the pinned Rspeedy fixture emits and decodes a
> content-hashed lazy bundle containing both main and background specializations.
> Background portals accept only current, physically attached, acknowledged
> `LynxPublicHandle` targets from the same transported and universal root; opaque
> root/host/generation provenance rejects stale, detached, cross-root, text, and
> native-list targets before mutation. Official JavaScript-host tests cover
> first-tree fallback/error/hidden-Activity adoption, later retain/reveal/reject,
> exact identity and lifecycle, abandoned suspension, pre-ACK rejection,
> accepted faults, portal ordering/retargeting, and teardown. Compatible HMR
> keeps a stable renderer wrapper and reconcilable owner/key/host topology, so
> background hook state and surviving host identity can remain live; compiler
> disposal unregisters removed thread sites, including modules without component
> exports. Renderer/root/snapshot, owner/key/host-shape, list/resource-schema, or
> receiver-lifecycle changes are reconstructing edits and require root/resource
> recreation; the end-to-end native reload receiver is not implemented. There is
> no Lynx Web, Explorer, Android, or iOS proof of native chunk execution, portal
> placement, retained visibility, transition timing, reload reconstruction, or
> stale resource cleanup, and no device performance evidence. The formal
> Milestone 8 and stable/IFR gates therefore remain blocked.

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
- Decide and implement or permanently diverge from ReactLynx's
  `defer.unmountRecycled` component/effect cleanup semantics with native
  recycling evidence.
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
