---
'octane': patch
---

Render transition-priority work in a later task, so a backlog of Action results or transitions commits once instead of once per microtask.

Transition renders were flushed on a microtask, like urgent ones. Every ready
continuation therefore paid for its own render and commit inside one microtask
checkpoint, and the browser could neither paint nor deliver input until the last
one had finished (#1864). A hundred synchronous `useActionState` dispatches
committed 101 times where React 19 commits twice. Transition renders scheduled
outside a render now wait for a host task of their own (`scheduler.postTask`,
then `MessageChannel`, then `setTimeout`), as React renders a transition lane in
a Scheduler task. That covers updates inside `startTransition`, Action results,
transitions started after an `await`, and, while an async Action is pending,
updates made outside a delegated event, `flushSync`, or a commit callback.

The pending cue still commits first: `useTransition` and `useActionState`
raising `isPending`, and `useOptimistic` showing a value, keep the microtask
flush. An urgent update to a component whose transition is waiting renders it
at once, and `flushSync` and `act()` drain both priorities. Code that expected a
transition's commit after awaiting only microtasks now needs to await a task, or
`act()`.
