---
'octane': minor
---

Add `useLazyRef(factory)`, which initializes a mutable ref from a factory when its hook cell is created and keeps that ref on later renders. `useRef(callback)` still stores the callback without calling it. Strong mode checks the factory with the same rules as a lazy `useState` initializer: it may read a clock, randomness, or browser state, but may not schedule work. Strong mode now also checks hook initializers, reducers, and updaters passed through a literal array spread, such as `useState(...[() => value])`. On universal renderers, a ref escaped from an abandoned render now keeps the last value written to it, as a plain object would. It no longer reverts to its initial value, and it no longer reads or writes a different ref committed later in the same hook slot.
