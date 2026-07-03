---
"octane": patch
---

React parity: static `aria-*` boolean literals bake as enumerated "true"/"false".

The compile-time static-literal attribute fast paths (client template HTML and
SSR) bypassed the `aria-*` enumeration the runtime `setAttribute`/`ssrAttr`
already implement: a static `aria-hidden={false}` was dropped entirely and
`aria-expanded={true}` baked a bare attribute. Both fast paths now special-case
`aria-*` boolean literals — `false` renders `aria-x="false"` and `true` renders
`aria-x="true"`, matching React and the dynamic-value path, so accessibility
state serialises correctly regardless of whether the value is static or dynamic.
