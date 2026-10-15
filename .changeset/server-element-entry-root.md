---
'octane': patch
---

`renderToString(<App />)` and the other server entry points render a component
element as its component's root, so `hydrateRoot` with either entry form adopts
it.
