# Upstream `@nanostores/react` audit

This port targets the immutable `@nanostores/react` release `1.1.0`:

- repository: `https://github.com/nanostores/react`
- tag: `1.1.0` → commit `f2a32b4a13fbe80aa1dace347b4f5b71d08244f4`
- package: `@nanostores/react@1.1.0`
- framework-agnostic core / oracle: `nanostores@1.2.0` (the port's
  `peerDependencies` floor; resolved against `nanostores@1.4.2` in this repo's
  lockfile). `react` is a peer upstream (`>=18.0.0`); Octane replaces it.

The port advertises the upstream `nanostores ^1.2.0` range. Upstream's own
`@nanostores/react@1.1.0` `peerDependencies` are `nanostores ^1.2.0` and
`react >=18.0.0`; this port drops `react` and gains `octane` instead.

## Source boundary

`@nanostores/react@1.1.0` is a single-file React binding: `index.js` (source,
~20 lines) + `index.d.ts` (types). It reuses the framework-agnostic
`nanostores` core (`atom`, `map`, `computed`, `listenKeys`, `Store`,
`StoreValue`) unchanged — that core has zero React imports and runs on Octane
as-is, so it is **consumed as a peer dependency, not vendored**. Only the thin
React binding layer (`useStore`, built on `useSyncExternalStore` + `useRef` +
`useCallback`) is reimplemented against Octane's identically named hooks.

Per the React-library-port convention ("Where a framework-neutral core is
reused verbatim, say so in the crosswalk instead of vendoring"), no
`upstream/` source tree is vendored: the upstream tarball ships only 5 files
(`index.js`, `index.d.ts`, `LICENSE`, `package.json`, `README.md`) and
includes **no tests**. The upstream test suite lives in the repo, not the
published package; its disposition is recorded below.

LICENSE: MIT, Copyright 2020 Andrey Sitnik `<andrey@sitnik.ru>`. The port
mirrors the original `package.json` authorship/funding fields and ships its
own MIT LICENSE.

The one Octane-specific divergence is hook slots: Octane keys hooks by a
compiler-injected per-call-site `Symbol`, appended as the **last** argument of
every `use*` call. Because this is a plain `.ts` module, `package.json`
declares `octane.hookSlots.manual: ["index.ts"]` so the binding forwards slots
itself: `useStore` accepts the caller's slot as its trailing argument and
derives stable child slots (one per internal base-hook call) via an internal
`subSlot` helper. This is invisible to consumers — `useStore(store)` and
`useStore(store, { keys, deps, ssr })` behave identically to React.

## Export crosswalk

`@nanostores/react@1.1.0` publishes exactly two exports from its entry point.
Both are ported 1:1. The port additionally keeps `subSlot` as a
**module-local** helper (not exported); upstream has no equivalent.

| Upstream export | Kind | Port status | Evidence |
| --- | --- | --- | --- |
| `useStore<SomeStore extends Store>(store, options?): StoreValue<SomeStore>` | hook | Ported (1:1) | `index.ts:121` `useStore`; mirrors upstream `index.js:10`. Slot threading (`index.ts:118-141`) is the only Octane-specific addition. Tests: `test/index.octane.test.tsrx` all cases. |
| `UseStoreOptions<SomeStore>` (`deps?`, `keys?`, `ssr?`) | interface (type) | Ported (1:1) | `index.ts:64` `UseStoreOptions`; mirrors upstream `index.d.ts:8` member-for-member. |

Non-exported upstream internals ported unchanged:

| Upstream internal | Port | Notes |
| --- | --- | --- |
| `emit` (`index.js:4`) | `index.ts:88` | Identical combinator. |
| `StoreKeys<T>` (`index.d.ts`) | `index.ts:60` | Identical conditional type. |

Octane-only additions (no upstream equivalent, **not** part of the public
parity surface):

| Symbol | Visibility | Why |
| --- | --- | --- |
| `subSlot(slot, tag)` | module-local (not exported) | Octane hook-slot derivation; matches the convention in `@octanejs/zustand`, `@octanejs/floating-ui`, `@octanejs/motion`. Memoized like its siblings. |
| `StoreWithKeys` | module-local | Narrows the runtime store type for `listenKeys`. |

No upstream export is omitted. The public surface is complete.

## Test-file disposition

Upstream ships no tests in the published tarball; its suite lives in the repo
at `test/`. Every upstream test file is accounted for:

| Upstream file | Disposition | Port location |
| --- | --- | --- |
| `test/index.test.ts` (8 cases, `@testing-library/react`) | Ported case-by-case to `.tsrx` with `@octanejs/testing-library` | `test/index.octane.test.tsrx` |
| `test/errors.ts` (helper) | Mirrored | `test/errors.ts` |
| `test/setup.js` (Vitest setup) | N/A — `@octanejs/testing-library` provides the mount/act setup; no standalone harness needed | — |

Upstream test cases (`test/index.test.ts`) → port cases (`test/index.octane.test.tsrx`):

| Upstream (line) | Port (line) | Notes |
| --- | --- | --- |
| `renders simple store` (22) | `renders simple store` (128) | |
| `does not reload store on component changes` (80) | `does not reload store on component changes` (192) | |
| `handles keys option` (149) | `handles keys option` (222) | Adapted across the supported `nanostores` range (1.2.0–1.4.x): whole-store `set` re-renders only when a watched key's value actually changes (value-aware `listenKeys` in ≥1.4). |
| `works with stores that set their values in lifecycle hooks` (217) | `works with stores that set their values in lifecycle hooks` (276) | |
| `useSyncExternalStore late subscription handling` (232) | `useSyncExternalStore late subscription handling` (285) | |
| `support for SSR does not break server behaviour in non-SSR projects` (248) | `support for SSR does not break server behaviour in non-SSR projects` (293) | |
| `support SSR to fix client hydration errors, use initial data` (293) | `support SSR to fix client hydration errors, use initial data` (317) | |
| `support SSR to fix client hydration errors, server passes data to client` (355) | `support SSR to fix client hydration errors, server passes data to client` (370) | |

Additional Octane-only cases (no upstream equivalent):

- `test/index.octane.test.tsrx:161` `useStore with and without options in one
  component` — covers the compiler's trailing-slot strip guard when a no-options
  `useStore(store)` and an options `useStore(store, {keys})` share one component.
- `test/slot-collision.test.tsrx` — regression / empirical proof that a plain
  `.ts` wrapper forwarding no slot does **not** collapse its inner hooks onto
  one identity (documents the false "hook slots collide without parent" report;
  see `status.json` notes).

No upstream test was skipped, weakened, or dropped. No `// OCTANE DIVERGENCE:`
markers are present because the observable behavior matches React on every
ported case — Octane's hook-slot threading is a mechanism, not a behavior
difference.

## Divergences

1. **Hook slots (mechanism, not API).** Octane keys hooks by compiler-injected
   per-call-site `Symbol`; `useStore` accepts the caller's slot and derives
   child slots via `subSlot`. Consumers see identical `useStore(store[, opts])`
   semantics. Recorded in `status.json`.

No behavioral divergence from React's `@nanostores/react@1.1.0` is known on the
ported surface.
