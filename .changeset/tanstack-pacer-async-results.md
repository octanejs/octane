---
'@octanejs/tanstack-pacer': patch
---

Update the Pacer adapter to 0.23.0 and the shared scheduler core to 0.22.0. Async debounce, rate-limit and throttle callbacks now preserve awaited result types and suppressed `undefined` results. Retain all entrypoints and verify scheduler ownership, provider isolation and hydration against the updated dependencies.
