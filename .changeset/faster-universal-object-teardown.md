---
'octane': patch
---

Speed up large universal object-driver teardown batches by compacting detached
sibling arrays once per transaction instead of shifting them for every host.
