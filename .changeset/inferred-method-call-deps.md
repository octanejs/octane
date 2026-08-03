---
octane: patch
---

Track the receiver of one-level method calls in inferred hook dependencies
(#542).

`useMemo(() => count.toFixed(2))` used to infer `[count.toFixed]` — a function
that lives on `Number.prototype` and therefore never changes identity, so the
memo stayed frozen at its first value while `count` moved. The same hazard
applied to any prototype method called on a one-level receiver, including
instance methods of replaced class instances.

Neither static alternative is right for every program: depending on `count`
fixes primitives but would re-run `props.onChange(...)` hooks on every parent
render, because `props` is a fresh container whose own function property is the
real dependency. The inferred array now compiles such calls to
`__methodDep(root, 'name')`, a new semi-public runtime helper that picks the
comparable value per render: the member when it is an own property of the
receiver, the receiver when the method is inherited, and `undefined` when the
property is absent (so `props.onReady?.()` stays inert until a handler is
passed). Own-property callbacks and absent optional handlers keep exactly their
previous recompute behavior; inherited-method calls now correctly recompute
when the receiver changes.

Deeper callees (`a.b.c(...)`) and computed callees (`a[k](...)`) already
tracked their receivers and are unchanged, as are explicit dependency arrays.
