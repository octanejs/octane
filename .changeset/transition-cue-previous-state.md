---
'octane': patch
---

Commit `isPending` with the previous state when the same component holds the transition's update, and render that update in the transition's task.

In the canonical `useTransition` pattern, one component holds both `isPending` and
the state its transition sets. That component rendered the pending cue and the
transition together in one microtask flush, so a click paid for the whole
transition render before the browser could paint "pending" (#1864). The cue now
renders without the transition's own updates and shows their previous values. The
component renders those updates in the transition's later host task, as React
renders `isPending` in an urgent lane before the transition lane. The same holds
for a `useOptimistic` value set in that component, and for a cue that arrives
while the component's transition is already waiting. Such a cue renders outside a
View Transition and leaves the transition's `addTransitionType` types to the
transition's own render.

An urgent update to a component whose transition is waiting still renders the
transition with it, and `flushSync` and `act()` still drain both priorities.
