---
'octane': minor
---

Add `scope.effect(run)` and keyless signals. An effect runs at once and again after each batch that changes a signal it read, calls the cleanup it returns before rerunning and when it stops, and stops when its scope is disposed. `scope.signal$(null, initial)` and `scope.derived$(null, compute)` declare values that are not serialized, inspected or staged by a transition, and cost as little as alien-signals' own nodes. Plain signal writes, derived recomputation and effect delivery also take shorter paths: on alien-signals' propagate benchmark Octane goes from 1.2–1.4× alien's time to 1.1–1.3×, with memory at parity.
