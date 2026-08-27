---
'octane': patch
---

Propagate same-module fetch-tree warm reachability through reverse component
edges instead of repeatedly rescanning every component. Deep TSrX component
graphs now compile without a declaration-order-dependent fixed-point penalty
while preserving opaque descendants, prop ownership, and synchronous cycles.
