---
"octane": patch
---

React parity: `useReducer` dispatch no longer eagerly bails out on `Object.is`-equal
state. Unlike `useState`'s setter (which keeps its eager fast path, matching React's
`dispatchSetState`), a dispatch whose reducer returns the same state still re-renders
the component once, matching `ReactHooksWithNoopRenderer-test.js` ("useReducer does not
eagerly bail out of state updates").
