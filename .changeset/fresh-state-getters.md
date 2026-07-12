---
'octane': patch
---

Add compiler-driven third-tuple current-state getters to `useState` and
`useReducer`. Getter-free destructures retain the existing runtime path, while
observed or escaped tuples receive a stable thunk that reads the latest state.
