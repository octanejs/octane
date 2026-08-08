# @octanejs/tauri

## 0.0.14

### Patch Changes

- Updated dependencies [80a9c7e]
- Updated dependencies [62d7f13]
- Updated dependencies [16df26e]
  - octane@0.1.31

## 0.0.13

### Patch Changes

- Updated dependencies [10011bb]
- Updated dependencies [081fa1e]
- Updated dependencies [60004f0]
- Updated dependencies [27758f5]
- Updated dependencies [136b0e3]
- Updated dependencies [d69ab86]
- Updated dependencies [1a27e19]
- Updated dependencies [7f6a134]
- Updated dependencies [ce68bb8]
- Updated dependencies [fbe0d39]
- Updated dependencies [9fa0b47]
  - octane@0.1.30

## 0.0.12

### Patch Changes

- Updated dependencies [8fb7990]
  - octane@0.1.29

## 0.0.11

### Patch Changes

- Updated dependencies [2b98a33]
  - octane@0.1.28

## 0.0.10

### Patch Changes

- Updated dependencies [46e1833]
- Updated dependencies [5a8e807]
  - octane@0.1.27

## 0.0.9

### Patch Changes

- Updated dependencies [1f01b08]
- Updated dependencies [48e2397]
  - octane@0.1.26

## 0.0.8

### Patch Changes

- bd8bb1b: Require Node.js 22.22.2 or newer across Octane's published packages.

  Add the `octane/compiler/register` preload for running server and SSG scripts
  directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
  plain TypeScript custom hooks in server mode without a Vite build. Bun also
  targets bare `octane` imports at `octane/server` in pass-through authored source
  dependencies, including packages that manage their hook slots manually.

- Updated dependencies [bd8bb1b]
  - octane@0.1.25

## 0.0.7

### Patch Changes

- Updated dependencies [ec77602]
- Updated dependencies [29c5bdb]
- Updated dependencies [9b032d8]
- Updated dependencies [f9b2731]
- Updated dependencies [6714914]
  - octane@0.1.24

## 0.0.6

### Patch Changes

- Updated dependencies [c1ad31b]
  - octane@0.1.23

## 0.0.5

### Patch Changes

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22

## 0.0.4

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21

## 0.0.3

### Patch Changes

- Updated dependencies [c6370b6]
- Updated dependencies [dd272ad]
- Updated dependencies [c151b71]
- Updated dependencies [66b51d8]
- Updated dependencies [a57c32a]
- Updated dependencies [e38a557]
- Updated dependencies [bd90e27]
- Updated dependencies [ae6811d]
- Updated dependencies [62d81b8]
  - octane@0.1.20

## 0.0.2

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19

## 0.0.1

### Patch Changes

- f36e016: New package: Octane hooks over Tauri v2's IPC surface.

  ```tsx
  const projects = useInvoke<Project[]>('list_projects', { archived: false });

  const { status, data, error, refetch } = useInvokeState<Sync>('sync_now');

  useTauriEvent<Progress>('sync:progress', (received) => setProgress(received.payload));
  ```

  Octane already runs in a Tauri webview with no adapter: a zero-config Vite
  project builds to the static assets `frontendDist` serves. What was missing is
  the lifecycle glue, so that is all this package is.

  `useTauriEvent` exists because `listen()` resolves its unlisten function
  _asynchronously_. A component that unmounts before that lands leaks the
  listener, which is the most common Tauri lifecycle bug in a hand-written
  `useEffect`; this hook detaches either way. The handler is read through a ref,
  so an inline closure does not resubscribe. A failed subscription throws by
  default, so a missing `core:event` permission is loud instead of a silently dead
  feature; pass `onError` for a supplementary subscription that should not take
  the subtree down, which also lets a changed `event` or `enabled` retry it.

  `useInvoke` memoizes the command promise on the call-site slot, so a replay
  never re-runs it. Its default refetch key compares a record argument by _value_,
  which keeps the ubiquitous `invoke('cmd', { id })` object literal from
  refetching on every render; array and binary payloads stay identity-compared
  because hashing them per render is unbounded work. `options.headers` is keyed
  the same way, so a rotated `Authorization` value refetches rather than serving
  what the previous token fetched.

  Everything is guarded on `window.__TAURI_INTERNALS__`, so a browser tab or an
  SSR pass never faults on a missing bridge: server rendering performs no IPC,
  `useInvokeState` renders `pending` and issues the command after hydration, and
  the suspending path rejects with `TauriUnavailableError` rather than hanging its
  boundary. The rest of `@tauri-apps/api` is already framework-neutral and is
  deliberately not re-exported.

  `examples/workbench` is a desktop task runner on this binding, with a real Rust
  backend beside a mock IPC bridge so its journeys run without a Rust toolchain.

- Updated dependencies [c3ba5e0]
- Updated dependencies [430061e]
- Updated dependencies [a21ff46]
- Updated dependencies [1821f63]
- Updated dependencies [3db74e9]
- Updated dependencies [0d4ed9e]
- Updated dependencies [7bdf1fa]
- Updated dependencies [e1927d8]
- Updated dependencies [dac0e66]
- Updated dependencies [54c60fa]
- Updated dependencies [59a95d6]
- Updated dependencies [138fbd9]
- Updated dependencies [50c1ab5]
- Updated dependencies [e0c5490]
- Updated dependencies [e6a158e]
  - octane@0.1.18
