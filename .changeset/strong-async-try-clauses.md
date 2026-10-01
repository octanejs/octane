---
'octane': patch
---

Strong mode no longer reports `OCTANE_STRONG_EFFECT_STATE_UPDATE` for a state
update in a `catch` clause that can only run after its `try` block yields. The
common effect pattern
`try { setData(await api.get(id)); } catch (error) { setError(error); }` now
compiles. A `catch` stays synchronous when something before the `try` block's
first guaranteed `await` can throw, such as a call, `new`, `throw`, or
iteration. The awaited call, calls it chains from through `then`, `catch`, or
`finally`, and calls written as array-literal elements of an awaited
`Promise.all`, `allSettled`, `any`, or `race` are trusted to reject rather than
throw. Their callees and arguments still count. `finally` clauses and statements
after the `try` follow the same rule.
