# @octanejs/tauri

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
