---
'octane': patch
---

Give `useOptimistic` on universal renderers the React 19 semantics the DOM
runtime already has. It previously ignored every passthrough value after the
first and never reverted an optimistic update. An optimistic update now shows
at once, even inside a transition, and rebases onto each new passthrough. It
reverts in the same commit as the transition it was dispatched in, or the
pending async action it follows, including when that action fails. An update
dispatched outside any transition shows once and then reverts. Without a
reducer, a function action updates the pending state, as in `useState`.
Dispatching an optimistic update while its component renders now throws, as in
React.
