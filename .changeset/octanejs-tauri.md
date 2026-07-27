---
'@octanejs/tauri': patch
---

New package: Octane hooks over Tauri v2's IPC surface.

```tsx
const projects = useInvoke<Project[]>('list_projects', { archived: false });

const { status, data, error, refetch } = useInvokeState<Sync>('sync_now');

useTauriEvent<Progress>('sync:progress', (received) => setProgress(received.payload));
```

Octane already runs in a Tauri webview with no adapter: a zero-config Vite
project builds to the static assets `frontendDist` serves. What was missing is
the lifecycle glue, so that is all this package is.

`useTauriEvent` exists because `listen()` resolves its unlisten function
*asynchronously*. A component that unmounts before that lands leaks the
listener, which is the most common Tauri lifecycle bug in a hand-written
`useEffect`; this hook detaches either way. The handler is read through a ref,
so an inline closure does not resubscribe. A failed subscription throws by
default, so a missing `core:event` permission is loud instead of a silently dead
feature; pass `onError` for a supplementary subscription that should not take
the subtree down, which also lets a changed `event` or `enabled` retry it.

`useInvoke` memoizes the command promise on the call-site slot, so a replay
never re-runs it. Its default refetch key compares a record argument by *value*,
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
