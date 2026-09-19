---
'octane': patch
---

Preserve explicit signal ownership when native event handlers are installed by components without signal bindings, including handlers adopted during hydration. Refresh ownership when bare or compiler-lifted handlers publish changed callbacks or captures, while keeping the committed authority if a suspended update is abandoned. Keep already queued native callbacks under their original authority when an earlier listener publishes a replacement. Avoid extra publication calls during ordinary mounting and updates that keep the same scope authority, and record rollback without per-handler undo closures.
