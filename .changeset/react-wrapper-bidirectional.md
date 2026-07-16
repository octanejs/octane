---
'@octanejs/react-wrapper': patch
---

New package: use Octane components inside a React app — the reverse direction
of `@octanejs/react-compat`, completing the bi-directional React bridge.
`OctaneWrapper` mounts a compiled Octane component into a React tree with real
`react`/`react-dom` as peers: props forward on every React commit through the
Octane root's same-body fast path (Octane state, effects and DOM survive React
re-renders), renders flush synchronously before paint, and React children
bridge into the Octane `children` hole through a layout-neutral portal slot, so
React state, context and event handlers keep working inside Octane-rendered
DOM and React → Octane → React nesting composes. `wrapOctane(Component)` turns
an Octane component into a first-class React component. Teardown unmounts the
Octane root (effect cleanups included) and StrictMode double-invoke is
supported.
