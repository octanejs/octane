---
"octane": patch
---

Keyed `@for` reorders no longer re-render survivors whose only change is position.

When a `@for` header binds no `index` name, its body cannot observe an item's
position, so a pure reorder (same item reference, moved to a new index) does not
need to re-render the survivor — only its DOM moves. The compiler now marks such
loops index-independent (a new `forBlock` flag), and the reconciler's pure
short-circuit skips the body for a moved survivor instead of calling `renderBlock`.
Previously every moved survivor re-rendered even though its output was identical.

Measured on a 1000-row keyed table: displace-k −46–48%, rotate/remove-first
−21–33%, reverse/shuffle a few percent (there the DOM moves dominate). An `@for`
that binds an `index` still re-renders on reorder so the index value stays correct
(conservative: the optimization applies only when the header provably binds no
index).
