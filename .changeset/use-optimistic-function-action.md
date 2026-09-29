---
'octane': patch
---

Without a reducer, `useOptimistic` now applies a function action as an updater
that receives the pending optimistic state, as `useState` does and as React 19
does. It previously stored the function itself as the optimistic state. Updaters
now chain, and they rebase onto each new passthrough while the action is
pending. The dispatch type without a reducer is now
`(action: State | ((pendingState: State) => State)) => void`.
