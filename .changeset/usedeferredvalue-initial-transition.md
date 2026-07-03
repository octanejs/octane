---
"octane": patch
---

`useDeferredValue(value, initialValue)`: the initial→value swap is a transition.

The steady-state deferral already committed via `startTransition` so a suspending
consumer keeps the prior DOM; the initialValue swap scheduled an URGENT re-render, so
a consumer that suspends on the real value tore down the initial content and flashed
the Suspense fallback. Both commits now run at transition priority (React's
`useDeferredValue` contract).
