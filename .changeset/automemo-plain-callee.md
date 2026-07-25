---
'octane': patch
---

Automatic memoization no longer gives up on a component because its template
renders a value through a function call. `{formatPrice(cents)}`, `{t('total')}`,
and `{segText(seg, done)}` are ordinary value projections, but a single one of
them previously disqualified the whole component — and, transitively, every
component that rendered it — from region memoization.

A call is admitted only when its callee is a module-scope immutable identity: an
imported binding, or a same-module `function` declaration that is never
reassigned and whose own body is itself a value projection. Everything else
still fails closed, because each can hide state that no dependency witnesses:

- a method on your data (`{header.getIsSorted()}`), including a helper that
  merely wraps one — the same hazard one call frame away;
- a component-local callee, which nothing pins to an immutable identity;
- hook calls (`use()` and any `use*`), which own suspension, hook cells, context
  subscriptions, and effect lifecycles rather than projecting a value;
- `new Foo()` and tagged templates.

Arguments carry the same contract, so `{format(row.get())}` stays disqualified.

Same-module `function` helpers that are never reassigned are also now accepted
as memo-region witnesses, on the same immutable-identity grounds already given
to same-module components and `const X = memo(C)` walls.

Measured on `benchmarks/chat-stream` (paired runs, same machine): 160 keystrokes
through the controlled composer 2.22ms → 0.78ms, streaming a reply into a
200-message history 1.56ms → 0.72ms, fine-grained token streaming 1.58ms →
0.96ms.

See "Automatic memoization and calls in templates" in
`docs/differences-from-react.md`.
