---
'octane': patch
---

SSR now processes render-phase state updates, matching React's server renderer: a `useState`/`useReducer` dispatch fired while its own component renders queues the update and re-invokes the body until a pass settles (bounded at 25, then "Too many re-renders"), so `renderToString`/`prerender` serialize the converged state instead of the initial value. Dispatches after the pass or from a different component stay inert, exactly like Fizz. Each retry rewinds what the discarded pass emitted — `useId` numbering, suspense seed order, suspense/discovery registrations, hoisted head markup, and frame child/occurrence counters — so the settled pass is byte-identical to a single-pass render of the final state.
