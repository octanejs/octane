---
'octane': patch
---

Reduce per-component SSR bookkeeping allocation: replay snapshots now share immutable empty collections instead of copying empty `Map`/`Set`/array state, stream boundary ancestor/owner key lists reuse a shared empty, and `HookPass` hook/occurrence maps are allocated lazily on first stateful or native hook call. Component-heavy server renders allocate roughly half the bookkeeping garbage they did before, with identical streamed output and unchanged render-phase replay semantics.
