---
'octane': patch
---

Trim production runtime overhead: hydration root recovery no longer stringifies the root component or builds dev-only diagnostics in production builds; delegated events with no handler on their path leave the native event's `stopPropagation`/`currentTarget` untouched; and native-read modules no longer enter an empty read scope for empty `@if`/`@else` arms.
