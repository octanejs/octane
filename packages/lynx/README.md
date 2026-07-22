# Octane Lynx

This directory now contains five deliberately separate pieces of the
ReactLynx-to-Octane migration:

- the immutable Milestone 0 audit and React-free framework probe;
- the private Milestone 1 compiler/package scaffold plus the source-level
  Milestones 2–4 background renderer, host boundary, native list, and platform
  API boundary;
- the private Milestone 5 production source/build path and packaged JavaScript
  testing facade;
- the private Milestone 6 render-only main runtime, first-tree adoption
  protocol, and dual-graph application build; and
- the private Milestone 7 Octane-owned thread-function transform, worklet/ref
  lifetime, and bidirectional call protocol.

The package is `0.0.0`, marked `private`, and is not a native renderer release.

## Milestones 3–7 private surface

The package now contains:

- a data-only `lynx` universal-renderer preset for `**/*.lynx.tsrx`;
- a compiler ABI facade over the DOM-free `octane/universal/native` entry;
- explicit background/main-thread compile metadata and a checked production
  JavaScript graph through the pinned Rspeedy toolchain;
- a background `createLynxRoot()` API and lazy `root` facade using the public
  cross-thread `ContextProxy`;
- a separate `@octanejs/lynx/main-thread` receiver which validates and stages
  complete batches, applies root-scoped Element PAPI mutations, flushes once,
  then acknowledges acceptance;
- async rejection, abort, accepted-fault, version-gap, stale-root, and terminal
  disposal behavior;
- acknowledgement-gated, cloned public identity handles whose identity survives
  updates and changes generation on recreation;
- deliberate PAPI routing for attribute removal, classes, complete dataset bags,
  inline styles, CSS scope metadata, and bundled URL/data-URI image sources;
- background bind/catch/capture/global-bind registration, versionless native
  tokens, data-only event payloads, and priority-scoped delivery;
- generation-scoped asynchronous `invoke`, `measure`, `fields`, `path`, and
  `setNativeProps` handles;
- retained Activity visibility with event disconnect/reconnect and no ref churn;
- Lynx-specific logical list descriptors backed by public list PAPI callbacks,
  callback-demanded physical cells, `item-key` identity, `reuse-identifier`
  pools, reorder updates, and teardown-safe late callbacks;
- physical attach/detach delivery through an optional universal capability, so
  background refs follow recycled native presence without exposing the list
  protocol to other renderers;
- root-scoped serializable handles from `createLynxNativeResource()` for
  application-owned custom-element resources in the background renderer; the
  synchronous first-screen renderer rejects these props because it cannot
  allocate background-root-scoped handles;
- augmentable init-data, global-props, and Native Module types plus background
  hooks for data/global-event updates, typed global access, public reload
  requests, and error reporting;
- separate main/background renderer presets, with compile-time rejection of
  statically visible `NativeModules` and `@octanejs/lynx/platform` use in the
  main-thread specialization; `createLynxRoot()` separately verifies the public
  background-only `lynx.getJSModule()` surface at runtime;
- a PrimJS-safe, one-shot `@octanejs/lynx/main-renderer` specialization which
  evaluates initial hooks and control flow, emits the first host batch, replaces
  ordinary first-screen handlers with event markers, and does not publish
  effects, refs, state ownership, or later updates; host props must be statically
  named in this graph, so JSX host spreads are rejected rather than retaining
  callback/ref values that cannot be erased soundly;
- a synchronous `@octanejs/lynx/first-screen` root facade with an explicit
  `markFirstScreenSyncReady()` gate for entry initialization; its
  `createLynxRoot()` export maps to the same one-shot main root while the
  background graph retains independent root creation;
- clone-safe first-tree snapshots, compatible background transfer without
  duplicate host allocation or restructuring, FIFO event replay only after the
  background listener table owns the adopted nodes, typed deterministic
  mismatch repair, and terminal cleanup;
- compiler-owned `'main thread'` and `'background only'` function directives
  with stable source identities, serializable capture isolation, layer-specific
  import removal, and source-attributed diagnostics;
- `main-thread:` Lynx event props and `main-thread:ref`, including explicit
  activation/release lifetimes, adopted-node ref updates, and rejection of
  colliding background/main handlers for the same native event;
- `useMainThreadRef(initialValue)`, whose main-local cell persists for the
  mounted hook owner while host detach still writes `null`, plus
  `runOnMainThread()` and `runOnBackground()` with cancelable promises,
  asynchronous values/errors, pre-adoption queuing, exactly-once settlement,
  and stale-root plus active/retained definition-revision rejection;
- renderer-local declarations for `page`, `view`, `text`, `raw-text`, `image`,
  `scroll-view`, `input`, `textarea`, `list`, and `list-item`;
- explicit custom-native-element augmentation through
  `LynxCustomIntrinsicElements`; and
- a stable `@octanejs/lynx/testing` facade over the exact
  `@lynx-js/testing-environment@0.3.0` JavaScript host emulator.

The private `@octanejs/rspeedy-plugin` Milestone 6 application mode owns the
dual-graph production build. `pluginOctane()` compiles the same authored entry
for both runtimes. Its generated main graph installs the receiver, resolves the
exact `@octanejs/lynx` package root to the synchronous first-screen facade,
evaluates authored imports under the render-only specialization, and opens the
manual synchronization gate only after synchronous initialization returns. The
background graph retains the complete Octane runtime and takes ownership by
adopting a compatible snapshot or repairing a mismatch. The plugin also
configures Lynx's framework-neutral template, CSS extraction, runtime wrapper,
and native encoding packages.

Production build tests construct and decode `.lynx.bundle` artifacts while
checking graph ownership, CSS/assets, source/debug information, and the absence
of React, Preact, and ReactLynx runtimes. Source and JavaScript-host tests cover
synchronous first-tree creation, adoption, repair, event handoff, and cleanup.
They do not prove native first paint or IFR behavior. Passing an explicit
`thread: 'background'` or `thread: 'main-thread'` to the Rspeedy plugin retains
the earlier isolated compiler-graph diagnostic mode; it is not the production
application path. Development builds wire the pinned Lynx transport, but no
runtime HMR or live-reload claim is made.

Milestone 7 keeps the same React-free boundary. Octane's compiler emits its own
stable thread-function IDs and descriptors, and the Lynx package owns capture
validation, registries, activation tokens, ref cells, and root-scoped call
messages. It does not import the ReactLynx component, Preact, transform, or
worklet runtime. The descriptor and Element PAPI event-envelope shapes follow
the pinned Lynx/ReactLynx interoperability boundary; their execution and
lifetime semantics remain Octane-owned.

Focused compiler, protocol, driver, and official-JavaScript-host tests exercise
main-thread event dispatch without a background callback token, ref
attach/detach/re-adoption, capture rejection, calls before adoption, async
results and errors, cancellation, and stale execution after host removal or
active/retained definition replacement. Raw descriptors that were never
activated or retained, removed module sites, and end-to-end runtime HMR remain
Milestone 8 work. These tests do not prove that a native engine executes the
worklet envelope on its main thread, that a gesture or continuous scroll avoids
a background round trip, or that Android/iOS ref updates and cancellation have
the same timing.

The official `@lynx-js/testing-environment` lane mounts compiled `.lynx.tsrx`,
updates state/context/conditionals, preserves keyed host identity while
reordering, exposes refs before layout effects, handles an injected post-ACK
PAPI fault once, and unmounts asynchronously. The Milestone 4 lane additionally
models 1,000 logical list items, materializes cells only when the public test
environment requests an index, reuses native cell identity, and makes late list
callbacks inert. Applications and package tests can import the environment's
stable classes, install/uninstall helpers, element-tree initializer, and global
event emitter through `@octanejs/lynx/testing`. That is deterministic JavaScript
host evidence, not native layout, paint, allocation, scrolling, device, or
performance evidence.

The testing subpath requires the optional peer
`@lynx-js/testing-environment@0.3.0`; install that exact package in projects that
import `@octanejs/lynx/testing`. Applications that do not use the testing
subpath do not need the peer.

The Node-only `lynx-list` benchmark adds a deterministic source-level operation
gate: a 12-cell visible window over 1,000 logical items allocates 12 fake-PAPI
cell roots, reuses them for the other 988 items, and leaves zero cells after
teardown. Its ratio guard compares that with a 1,000-cell eager model. This is
not a native-memory or timing result.

The Milestone 3 host boundary is implemented in private source and tests. It
accepts class strings, inline styles, complete dataset bags, CSS scope metadata,
and bundled URL/data-URI image sources; registers every background
bind/catch/capture/global-bind event kind; exposes asynchronous `invoke`,
`measure`, `fields`, `path`, and `setNativeProps` handles; and preserves retained
host visibility. CSS import and CSS Module extraction, stylesheet/template
sections, and asset bundling are now connected by the private Milestone 5
Rspeedy production source/build path.

These tests do not establish production native behavior. `dispatchNativeEvent()`
and `dispatchNativeEventBatch()` are source/test bridge methods because the
native callback receiver remains private. `@lynx-js/testing-environment@0.3.0`
models `__SetDataset` with `Object.assign`, so it cannot observe deletion of
omitted keys, and it implements selector-query `setNativeProps` while `invoke`,
`fields`, and `path` throw. Selector compatibility, measurement/layout results,
form/scroll behavior, and cleanup therefore still require Explorer, Android,
and iOS evidence. The platform subpath now implements source/test-only
background hooks. Init data is seeded from public `__presetData` and prefers
the framework-maintained current `__initData` snapshot when present, so source
tests cover reset key removal and an update between render and layout
subscription. Installing and proving the native update receiver that maintains
that snapshot remains a formal gate. The `reload()` API forwards a public
request; it is not the missing framework reload receiver. No public
page-destroy receiver has been installed. The packaged testing facade and
production Rspeedy assembly do not remove those native execution gates.

## Milestones 4–7 exclusions and examples

The initial Milestone 4 surface rejects nested `<list>` hosts and does not claim
Lynx host proof for portals, Suspense, lazy bundles, gestures, or animations.
Boolean `defer` is accepted and forwarded as list metadata, but all cells are
callback-demanded regardless of that prop, so this is not full ReactLynx
`defer` semantics. ReactLynx's `defer={{ unmountRecycled: true }}` lifecycle
behavior is also not implemented: recycling clears physical refs without
unmounting the logical Octane subtree.

Native list hosts and materializations are excluded from first-tree capture, so
initial trees containing a native list have no Milestone 6 adoption claim.
Boolean `defer` still has only the Milestone 4 metadata behavior; no eager-main
versus deferred-background semantics are claimed without native evidence.

`reuse-identifier` accepts strings. Omitting it or passing an empty string uses
the default native reuse pool; logical identity still comes from the mandatory
unique `item-key` and Octane key.

The repository's
[`examples/native-capabilities`](https://github.com/octanejs/octane/tree/main/packages/lynx/examples/native-capabilities)
directory contains app-owned Android and iOS Native Module and custom-element
skeletons plus Octane type augmentation and authoring code. They are excluded
from the package's published files and have not been compiled or executed on
Android or iOS. They document the integration boundary; they are not release or
device evidence.

The supported package subpaths are:

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

The production source/build path generates both specializations from one
authored entry:

```ts
// src/index.ts — evaluated by both specialized runtimes
import { root } from '@octanejs/lynx';
import { App } from './App.lynx.tsrx';

await root.render(App);
```

```js
// rspeedy.config.mjs
import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

export default defineConfig({
	source: { entry: './src/index.ts' },
	plugins: [pluginOctane()],
});
```

`installLynxMainThread()` remains public for isolated receiver tests and the
explicit one-thread compiler diagnostic mode. It is not a second application
entry in normal application mode.

Milestone 7 remains pinned to Lynx SDK `3.9.0` with target SDK `3.9`, Rspeedy
`0.16.0`, Rsbuild `2.1.4`, Rspack `2.1.3`, template plugin `0.13.0`, CSS extract
plugin `0.9.0`, runtime wrapper `0.2.2`, dev transport `0.3.0`, tasm `0.0.39`,
testing environment `0.3.0`, Lynx types `4.0.0`, and the blocked Web control
`@lynx-js/web-core@0.22.2`. This is one exact private compatibility set, not a
minimum-to-current supported range.

Native applications keep Lynx's event spelling: `bind`, `catch`,
`capture-bind`, `capture-catch`, and `global-bind`. There is no DOM-style event
alias or synthetic event layer. Page destroy, framework reload/background
teardown, and native string-event delivery still lack the public framework
hooks required by the plan. List recycling and the app-owned Native Module and
custom-element boundary remain exactly as qualified above.

## Current decision

Milestone 0 remains **blocked from exit**. The selected public packages expose
PAPI, cross-thread contexts, and typed lifecycle messages, but do not expose a
framework-neutral background receiver for native string event tokens. The
ReactLynx path uses `lynxCoreInject.tt.publishEvent`; reload and background
teardown also depend on injection-specific callbacks.

The production Web control and transport bundles currently fail before
rendering under `@lynx-js/web-core@0.22.2` with a `MutationObserver` target type
error; the transported path additionally reports that Web `postMessage` is not
implemented. Explorer, Android, and iOS execution were unavailable on the
capture host. These remain explicit gates. The private Milestones 6–7 source/build
path does not waive them and must not be described as a preview or production
renderer.

Milestones 3–7 have host/build-side private source and official-JavaScript
evidence, but their formal exits remain unmet. Milestone 6 specifically lacks
native proof that the synchronous tree paints before background readiness or
that adoption retains platform node identity. Milestone 7 lacks native proof of
main-thread event execution, adopted-node ref identity, gesture/continuous-event
latency, and cross-thread call cleanup. The unresolved Milestone 0 native
event/lifecycle/reload hooks, Web failure, Android/iOS evidence, real
selector-query/layout/list allocation behavior, app-native module/element
execution, source-map resolution in an engine, runtime HMR cleanup, pinned
ReactLynx differential, and semantic performance baselines remain gates.

## What the Phase 0 probe proves

- A published, exact Lynx/Rspeedy/Rsbuild/Rspack compatibility set can build
  framework-owned main- and background-thread programs.
- The official JavaScript testing environment accepts an Element PAPI tree,
  acknowledged background updates, native-token taps, and teardown.
- Complete batches are validated before PAPI mutation, and accepted batches
  cross one explicit flush boundary before acknowledgement.
- Production native and Web bundles contain no ReactLynx or Preact runtime.
- The Milestone 3–7 receiver uses named public `ContextProxy` events rather than
  the probe's `postMessage` fallback and keeps live Element PAPI objects wholly
  on the main thread.
- Source/build and JavaScript-host tests show that the same authored entry has
  separate render-only main and full background graphs, and that a compatible
  first tree transfers without a second host allocation or structural mutation.
  This is not native paint, identity, or performance evidence.
- Source and JavaScript-host tests show that Octane-owned worklet descriptors
  carry isolated data captures, main-thread event/ref lifetimes are released on
  host removal, and bidirectional calls settle or cancel once across adoption.
  This is not evidence of native main-thread execution or latency.

The `imperative` entry is a small direct-PAPI control. The `main` entry runs the
same visible tree through the Phase 0 background commit protocol.

See:

- [`audit/toolchain.json`](./audit/toolchain.json) for immutable versions,
  commits, tarball integrities, and host constraints.
- [`audit/upstream-crosswalk.json`](./audit/upstream-crosswalk.json) for the
  ReactLynx public/test inventory and remaining runner-expanded case gate.
- [`audit/framework-contracts.md`](./audit/framework-contracts.md) for the
  public/private framework boundary.
- [`audit/phase-0-evidence.json`](./audit/phase-0-evidence.json) for captured
  results and blocked device/runtime gates.
- [`audit/runtime-compatibility.json`](./audit/runtime-compatibility.json) for
  checked Milestone 1–6 syntax, built-in, and runtime-graph assumptions and
  their qualifications.
- [`UPSTREAM.md`](./UPSTREAM.md) for provenance and reuse policy.

## Reproduce the Phase 0 evidence

The probe owns a standalone npm lock so the pinned Rspack graph cannot be
changed by the monorepo catalog.

```bash
cd packages/lynx/probe
npm ci --ignore-scripts
npm run phase0
```

To inspect the Web gate locally after building:

```bash
npm run serve:web
```

Open `http://127.0.0.1:4177/` for the transported probe or add `?imperative`
for the direct-PAPI control.
