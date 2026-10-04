---
'octane': patch
---

Let a `@try` wait for its component's replay when that render updated its own state.

A non-Strong component can update its own state while it evaluates a slot's
arguments, such as a child's props or an `@if` condition. That render then
replays before its slots settle, and every other slot waits for the replay. A
`@try`, or an imported JSX `<ErrorBoundary>`, instead mounted during the
discarded pass. In a fragment body its earlier siblings then rendered after it.
Its body also rendered from state the replay discards: a throw there committed
the `@catch` arm, and a suspension showed `@pending` or suspended the whole
render. Hydration adopted the boundary's server range out of order and rebuilt
the component. The boundary now waits for the replay, and renders once from the
settled state.
