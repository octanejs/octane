---
'octane': minor
---

Add `useRetainedSignalValue` and `useSignalSubscription` to `octane/signals/react`. Readers can keep a watched source active while React Activity hides their view and catch up when it returns. The subscription hook lets `useSyncExternalStore` consumers provide their own snapshots and optionally customize how they attach a listener.
