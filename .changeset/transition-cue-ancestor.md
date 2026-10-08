---
'octane': patch
---

Render a pending cue at urgent priority, so a cue in an ancestor commits before the transition it announces.

A `useTransition` or `useActionState` raising `isPending`, or a `useOptimistic` value,
rendered at transition priority in the click's microtask flush. When that render
reached a descendant whose state the transition sets, the descendant rendered its
new state there too, so the browser could not paint the cue until the whole
transition render had finished (#1864). The cue now renders at urgent priority, as
React renders it in an urgent lane. Descendants show their previous state and
render the transition in its later host task.

Because the cue is urgent, a component that suspends while rendering it shows its
boundary's fallback, as in React. A commit of cues alone, such as an async Action's
before its first update, no longer starts a View Transition; transition work that
commits with them keeps its capture.
