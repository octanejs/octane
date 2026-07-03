---
"octane": patch
---

React parity: an unguarded render-phase state update (a `setState` called
unconditionally during render) now throws `Too many re-renders. Octane limits the
number of renders to prevent an infinite loop.` after 25 same-block re-renders in one
drain, instead of hanging the flush forever. The error routes through `@try` /
`ErrorBoundary` like any render error. Guarded derived-state patterns (mirror a prop,
converge in a few passes) are unaffected and now pinned by conformance tests.
