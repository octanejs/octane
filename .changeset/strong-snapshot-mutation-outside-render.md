---
'octane': minor
---

Strong mode now rejects mutating a state value outside render
(`OCTANE_STRONG_SNAPSHOT_MUTATION`): in event handlers, effects, cleanup,
timer and promise callbacks, and local helpers that receive the value. Passing
a mutated array back to its setter does not re-render, and copying only the
outer object leaves identity-based consumers stale and rewrites the value that
transitions and `useOptimistic` revert to. Pass a new value instead, such as
`setItems([...items, item])`, or keep mutable objects in `useRef`. Array
mutators are now also recognized on nested literal properties and on state
initialized lazily or through `useReducer`, `Map` and `Set` mutators on state
created with `new Map()` or `new Set()`, and `Object.assign`-style targets;
render-time mutations keep `OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION`.
Compatibility mode is unchanged.
