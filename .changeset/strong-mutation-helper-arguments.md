---
'octane': patch
---

Strong mode now also reports a state value mutated outside render through a
whole state tuple passed to a local helper (including a destructured tuple
parameter), through an Effect Event called with
the state, and through a helper, updater, or reducer parameter that has a
default value. A `useLinkedState` reconciler that returns a literal now proves
array, `Map`, and `Set` mutators on that state, like a lazy `useState`
initializer.
