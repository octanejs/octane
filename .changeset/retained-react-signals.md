---
'octane': minor
---

Add `useRetainedSignalValue` and `useSignalSubscription` to `octane/signals/react`. Readers can keep a watched source active while React Activity hides their view and catch up when it returns. The subscription hook lets `useSyncExternalStore` consumers provide their own snapshots and optionally customize how they attach a listener. `RetainedSignalProvider` shares a historical server snapshot resolver and Activity retention defaults with nested readers; explicit hook arguments take precedence. `useOptionalRetainedSignalValue` accepts a native handle or an inactive primitive fallback without adding work to the strict handle reader.
