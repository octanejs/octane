---
'octane': minor
---

Strong mode now requires state updaters and reducers to be pure
(`OCTANE_STRONG_IMPURE_UPDATER`). Octane evaluates queued updaters and reducers
while their owner renders and can call them more than once: a transition
update is evaluated when it is staged and again when the transition renders,
and an urgent update made while a transition is held is rebased onto the held
value. A `useState` or `useLinkedState` updater, a `useReducer` reducer, or a
`useOptimistic` reducer that calls `fetch`, schedules a timer, microtask, or
promise callback, updates state, calls a state getter or Effect Event, touches
`useRef.current`, reads a browser global or reassigned module variable, or
calls `Date.now()`, `Math.random()`, `performance.now()`, or `new Date()` is a
compile error. Inline functions, local and same-module declarations, and
synchronous helpers are followed. Mutating the state an updater or reducer
receives reports `OCTANE_STRONG_SNAPSHOT_MUTATION`. Do the work in the event
handler and pass the result in. Compatibility mode is unchanged.
