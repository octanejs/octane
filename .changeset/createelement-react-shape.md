---
"octane": patch
---

`createElement` is now React-shaped around `key` and `props`. `key` is lifted OUT of
the descriptor's `props` (it was previously left on it), and the caller-supplied props
object is never mutated — positional children are folded into a fresh copy instead of
being written onto the caller's object. The hot 2-arg `createElement(Comp, props)` path
(no key, no positional children) stays allocation-free and passes props through.
