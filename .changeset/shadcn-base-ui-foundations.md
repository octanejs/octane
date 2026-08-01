---
'@octanejs/shadcn': patch
---

Add the foundation families to the Base UI base: `button`, `input`, `label`, `separator`,
`textarea` and `kbd`.

`button`, `input`, `label` and `separator` run on real `@octanejs/base-ui` primitives, so their
behavior is the primitive's rather than derived. `textarea` and `kbd` are plain hosts because
Base UI ships no textarea or Keyboard primitive.

`separator` takes the React Aria base's class string rather than the Radix one on purpose: Base
UI publishes orientation as `aria-orientation`, so Radix's `data-horizontal:` utilities would
never match and the separator would render with no thickness.

No `LinkButton` — Base UI has no `Link` primitive, and upstream composes links through `render`
instead. `pagination`, which consumes it in the React Aria base, stays unported until the
upstream source shows how.
