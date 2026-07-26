---
'octane': patch
---

Allocate a Scope's `cleanups` and `children` arrays lazily.

Both were created eagerly for every Scope even though most scopes never register
a cleanup or a child scope, while the neighbouring `hooks`, `effectSlots` and
`_slots` fields were already lazy. They now follow the same pattern: `null` until
something registers, allocated at the registration site.

On a 500-row × 3-cell tree (2,501 scopes) this removes 4,002 of the 7,503 array
allocations those three collections were making — every `cleanups` array and 60%
of the `children` arrays. Compiled output grows 17 bytes gzipped across the
16-file codegen corpus, from the `??=` at the three cleanup-registration sites.

`slots` deliberately stays eager: every scope in that same measurement used it,
so making it lazy would add a null check to the framework's hottest path and to
every emitted `__s.slots[N]` access while saving nothing.
