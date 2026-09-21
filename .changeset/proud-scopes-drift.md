---
'octane': patch
---

Store signal-instance identity directly on scope and block fields instead of a
per-mount `WeakMap` record, so stamping a component's scope costs a handful of
stores rather than an allocation plus a map entry. Lite components resolve their
signal owner without allocating a per-mount closure when the owner is already
current, and dormant blocks — no registered effects, no root-transaction capture
— skip the render bookkeeping those subsystems only need once armed. Effect
Event payloads queued under a hidden Suspense boundary now park on the boundary
and publish at reveal, so a rolled-back render never installs a stale impl.
