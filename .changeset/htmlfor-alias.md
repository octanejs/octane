---
"octane": patch
---

`htmlFor` now writes the native `for` attribute (React parity, like `className`).

Previously it produced a dead `htmlfor` attribute. Aliased everywhere an attribute
can be written: the compiler's static template emission, the runtime's dynamic
`setAttribute`/de-opt paths, and SSR serialization.
