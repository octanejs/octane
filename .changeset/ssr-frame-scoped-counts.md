---
'octane': patch
---

Reduce per-node SSR bookkeeping cost in the emission hot path: frame-local scoped counters (per-arm child ordinals and per-site `use()` occurrences) now live in a flat pair list — comparing scope strings directly instead of hashing them into a `Map` — and promote to a `Map` only past eight distinct keys. `process.env.NODE_ENV` is sampled once per synchronous render pass rather than read on every attribute/style emission check, with public entry points still reading it directly so out-of-pass calls never see a stale sample.
