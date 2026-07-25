---
'octane': patch
---

Automatic memoization no longer gives up on a component because its template
renders a value through a function call. `{formatPrice(cents)}`, `{t('total')}`,
and `{segText(seg, done)}` are ordinary value projections, but a single one of
them previously disqualified the whole component — and, transitively, every
component that rendered it — from region memoization.

Calls through a **method on your data** (`{header.getIsSorted()}`) still
disqualify the region: the receiver can return a new answer while the object
identity that would witness the change stays the same, which is the shape
table/grid/store bindings produce. Hook calls (`use()` and any `use*`) are never
treated as value projections either, since they own suspension, hook cells,
context subscriptions, and effect lifecycles.

Same-module `function` helpers that are never reassigned are also now accepted
as memo-region witnesses, on the same immutable-identity grounds already given
to same-module components and `const X = memo(C)` walls.

Measured on `benchmarks/chat-stream` (paired runs, same machine): 160 keystrokes
through the controlled composer 2.22ms → 0.78ms, streaming a reply into a
200-message history 1.56ms → 0.72ms, fine-grained token streaming 1.58ms →
0.96ms.

See "Automatic memoization and calls in templates" in
`docs/differences-from-react.md`.
