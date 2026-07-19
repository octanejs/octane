---
'octane': patch
---

Export `OctaneNode`, the analog of React's `ReactNode`: the type of a renderable prop or child (an alias of `unknown`, matching the jsx-runtime `children` contract). Bindings ported from React should use it for props upstream types as `ReactNode`, which would reject octane's nominal elements.
