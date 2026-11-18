---
'octane': minor
---

Add `createFamily` to `octane/signals`: a scope-owned family of keyless signals, one stable member per logical key, with optional `keyOf` key identity, explicit eviction, and an `idle` policy that evicts members nothing has read for a while. Evicted members retire like a disposed scope's signals, and derived members let go of their dependencies so key churn does not leak.
