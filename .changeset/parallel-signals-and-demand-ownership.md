---
"octane": patch
---

Start compiler-proven independent query and asynchronous derivation reads together while retaining strict read order, actual data dependencies, cancellation, and lazy conditional work. This does not add transactional signal publication or delay native input updates.

Avoid speculative signal owners and eagerly serialized invocation paths in ordinary rendering. Preserve late signal activation and retired event ownership, and align keyed component identities between server rendering and hydration.

Retain pending component queries across rendering retries, releasing obsolete work on replacement, cancellation, and unmount. Support checked dynamic projection functions in immutable imported-factory configurations and imported string-token style keys in renderer-free views, preserving ordered attribute merges and property ownership.

Release native control leases when their exact signal owner retires, independent of application page-cleanup order. Initial dead-owner reads and genuine computation errors still fail; ordinary signal subscribers retain their final invalidation.
