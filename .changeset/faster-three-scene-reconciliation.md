---
'octane': patch
'@octanejs/three': patch
---

Reduce universal keyed-scene reconciliation and Three renderer lifecycle and
frame-subscriber overhead while preserving object identity, transactional
cleanup, and priority ordering.
