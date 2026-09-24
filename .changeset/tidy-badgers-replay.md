---
'octane': patch
---

Slim the changed-commit host-prop write path: a shape-stable `sources` tuple
commits once into a verified plan that later commits replay — one flat pass
rebuilds, or bails into, the resolved record without materializing the writer
Maps — and a commit whose resolved record matches the previous commit's skips
the write tail entirely. Signal host-prop bindings now journal their per-commit
fields by value instead of cloning the whole record, so a discarded transition
restores a superseded binding's sources, resolved record, pending control
listener, and disposal flag exactly.
