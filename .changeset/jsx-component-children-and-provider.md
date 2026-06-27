---
"octane": patch
---

Fix React-style `.tsx` (JSX) rendering of `Context.Provider` children and of host elements with component children.

- `<SomeContext.Provider value={…}>…</SomeContext.Provider>` authored in `.tsx` now renders its children. Previously the built-in Provider only ran a `.tsrx`-style render-function child and silently ignored an element-descriptor child (the shape a React-style parent produces via `createElement`), so the whole subtree under the Provider rendered nothing.
- A host element with component children produced via `createElement` from a control-flow return — e.g. a component that returns `<div><Child/><Child/></div>` from inside an `if`, so the compiler emits the de-opt path instead of a static template — now renders, and its component children mount as real Blocks that **reconcile** across re-renders (their state/hooks are preserved) and unmount cleanly. Previously this threw "rendering a component on the de-opt path is not supported".

- The de-opt path now **reconciles host elements in place** (reuses the DOM node, diffs props, matches children by key/position) instead of rebuilding them every render. This was a correctness bug, not just a perf issue: rebuilding destroyed DOM-resident state — an `<input>`'s value, focus, selection, scroll position, media playback — whenever a parent re-rendered. Host nodes (and their per-item nodes in a `{items.map(...)}` list) now keep their identity across re-renders, and adopt the server DOM on hydration.
- Positional component children (`<div><A/><B/></div>`, which `createElement` collapses into an array) no longer emit the "each element should have a unique key" warning — those are fixed siblings that never reorder, so they're keyed by index silently. A real `.map()` without keys still warns.

Together these let deeply-recursive, control-flow-driven component trees with Context (the shape React-style code commonly uses) render through octane's JSX backwards-compat path with correct DOM-state preservation. Also fixes a latent teardown gap where an array-valued `{expr}` child slot (`{items.map(...)}`) did not fire its items' cleanups on unmount.
