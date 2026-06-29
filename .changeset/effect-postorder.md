---
"octane": patch
---

Layout / insertion / passive effects now fire in React's exact **post-order** commit
order — a node's descendants run before it, and disjoint subtrees run in tree order.
Previously octane drained each effect phase by depth (deepest-first globally), which got
the parent/child relationship right but mis-ordered a shallow node in an EARLIER sibling
subtree against a deeper node in a LATER one (e.g. `<A/>` then `<Wrap><B/></Wrap>` fired
B before A because B was deeper). Effects are now tagged with their enqueue sequence and
drained descendant-before-ancestor via the block tree, falling back to enqueue (tree)
order for siblings — matching React's commit walk. This matters for any parent effect
that reads refs/measurements established by an earlier sibling subtree's effects.

Deferred ref attaches now drain in the same post-order (they previously used the same
depth sort), so callback/object refs attach child-first and in tree order, consistent
with the effect phases that read them.
