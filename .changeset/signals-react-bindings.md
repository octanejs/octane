---
'octane': minor
---

Add `octane/signals/react`, so React components can read scoped signals without the Octane compiler. `useSignalValue(handle$)` subscribes through `useSyncExternalStore` and re-renders only when the value changes, and `SignalScopeProvider`/`useSignalScope` pass a borrowed scope down a React tree. A component still mounted when its scope is disposed throws `ScopeDisposedError` to the nearest error boundary instead of showing the retired value, and a client scope seeded from the server's `scope.serialize()` hydrates without a mismatch.
