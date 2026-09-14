---
'octane': patch
---

Resolve the renderer-region owner with a single lookup at the top of the block chain instead of a WeakMap read per ancestor on every provider-less context read, preserving context defaults and foreign-renderer routing.
