---
"octane-ts": patch
---

Compiler: support custom hooks and library bindings.

The compiler now injects a per-call-site slot symbol for any call matching React's
`use[A-Z]` hook convention — not just the built-in hooks — and passes it as the
trailing argument. A custom hook is therefore a plain wrapper that **forwards** that
slot to the base hook it composes (every base hook already accepts an optional trailing
slot). Because the slot is per-call-site, two calls to the same custom hook in one
component — `useFoo(a)` and `useFoo(b)` — stay independent, exactly like in React.

Nested hook calls now resolve too: a hook used as an **argument** to another hook (e.g.
`useStore(api, useShallow(sel))`, or a hook in a deps array) gets its own slot. Before,
`rewriteHookCalls` appended the outer slot but did not recurse into the call's arguments,
so the inner hook was left without one.

This is what lets hook-based libraries be bound to octane by reimplementing only their
thin React binding on octane's base hooks (see the new `@octane-ts/zustand`).
