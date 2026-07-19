# Octane Lynx

This directory now contains two deliberately separate pieces of the
ReactLynx-to-Octane migration:

- the immutable Milestone 0 audit and React-free framework probe; and
- the private Milestone 1 compiler/package scaffold plus the source-level
  Milestones 2–3 background renderer and host boundary.

The package is `0.0.0`, marked `private`, and is not a native renderer release.

## Milestone 3 source surface

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
- renderer-local declarations for `page`, `view`, `text`, `raw-text`, `image`,
  `scroll-view`, `input`, `textarea`, `list`, and `list-item`;
- explicit custom-native-element augmentation through
  `LynxCustomIntrinsicElements`.

The official `@lynx-js/testing-environment` lane mounts compiled `.lynx.tsrx`,
updates state/context/conditionals, preserves keyed host identity while
reordering, exposes refs before layout effects, handles an injected post-ACK
PAPI fault once, and unmounts asynchronously. That is deterministic JavaScript
host evidence, not native layout, paint, device, or performance evidence.

The Milestone 3 host boundary is implemented in private source and tests. It
accepts class strings, inline styles, complete dataset bags, CSS scope metadata,
and bundled URL/data-URI image sources; registers every background
bind/catch/capture/global-bind event kind; exposes asynchronous `invoke`,
`measure`, `fields`, `path`, and `setNativeProps` handles; and preserves retained
host visibility. CSS import and CSS Module extraction, stylesheet/template
sections, and asset bundling remain owned by the Milestone 5 Rspeedy production
path.

These tests do not establish production native behavior. `dispatchNativeEvent()`
and `dispatchNativeEventBatch()` are source/test bridge methods because the
native callback receiver remains private. `@lynx-js/testing-environment@0.3.0`
models `__SetDataset` with `Object.assign`, so it cannot observe deletion of
omitted keys, and it implements selector-query `setNativeProps` while `invoke`,
`fields`, and `path` throw. Selector compatibility, measurement/layout results,
form/scroll behavior, and cleanup therefore still require Explorer, Android,
and iOS evidence. Platform APIs remain Milestone 4 work; packaged testing
helpers and production Rspeedy assembly remain Milestone 5 work.

The supported package subpaths are:

```text
@octanejs/lynx
@octanejs/lynx/config
@octanejs/lynx/renderer
@octanejs/lynx/intrinsics
@octanejs/lynx/intrinsics/jsx-runtime
@octanejs/lynx/main-thread
@octanejs/lynx/platform
@octanejs/lynx/testing
```

Framework bootstrap installs the receiver on the main thread before rendering
the background root:

```ts
// main-thread entry
import { installLynxMainThread } from '@octanejs/lynx/main-thread';

installLynxMainThread();
```

```ts
// background entry
import { root } from '@octanejs/lynx';
import { App } from './App.lynx.tsrx';

await root.render(App);
```

This manual bootstrap documents the implemented seam; the Rspeedy plugin does
not install it automatically until the Milestone 5 production path exists.

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
capture host. These remain explicit gates. The package scaffold does not waive
them and must not be described as a preview or production renderer.

Milestone 3's host-side private source and official-JavaScript implementation is
complete, but its formal exit remains unmet. The unresolved Milestone 0 native
event/lifecycle/reload hooks, Web failure, Android/iOS evidence, real selector
query/layout behavior, and pinned ReactLynx differential remain gates.

## What the Phase 0 probe proves

- A published, exact Lynx/Rspeedy/Rsbuild/Rspack compatibility set can build
  framework-owned main- and background-thread programs.
- The official JavaScript testing environment accepts an Element PAPI tree,
  acknowledged background updates, native-token taps, and teardown.
- Complete batches are validated before PAPI mutation, and accepted batches
  cross one explicit flush boundary before acknowledgement.
- Production native and Web bundles contain no ReactLynx or Preact runtime.
- The Milestone 3 receiver uses named public `ContextProxy` events rather than
  the probe's `postMessage` fallback and keeps live Element PAPI objects wholly
  on the main thread.

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
  checked Milestone 1 syntax/built-in assumptions and their qualifications.
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
