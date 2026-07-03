---
"octane": patch
---

SSR: `render()` now normalizes a root component that returns a `createElement`
descriptor.

A plain-`.ts` root (the shape every `@octanejs/*` binding produces) returns a
descriptor rather than a compiled HTML string; `render()` previously used the return
value as the body directly, yielding `[object Object]`. The root's return is now routed
through `ssrChild` exactly like `ssrComponent` already does for child components —
descriptor trees, component descriptors, and `null` roots all render correctly.
