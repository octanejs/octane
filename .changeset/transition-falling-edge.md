---
'octane': patch
---

Drop `useTransition`'s `isPending` in the same render that commits the transition's updates.

React's transition lane carries `setPending(false)` with the transition's own
updates, so `isPending` falls in the commit that shows them. Octane published the
falling edge from a follow-up after the transition's task flush, which cost a second
render and commit in that task: a component holding both `isPending` and the
transition's state committed `"b pending"` and then `"b idle"`, and a separate
button's `idle` committed after the panel its transition updated (#1864). The
falling edge now renders with the transition. If a render in that pass suspends and
holds the transition, `isPending` stays true and no `idle` commits. A
`useOptimistic` value that a synchronous transition showed reverts in that same
commit.

The falling edge is transition work, so it now waits for the transition's task when
an urgent update takes over the transition's components, or when the transition
updates nothing. When `flushSync` or `act()` drains a cue together with the
transition it announces, the cue still commits first, and its falling edge follows
in a later task.
