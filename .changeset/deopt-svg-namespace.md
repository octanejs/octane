---
"octane": patch
---

The runtime de-opt reconciler now creates SVG elements in the correct namespace.
Previously, an SVG subtree produced at a VALUE position — e.g. `createElement('svg',
…)` / `<svg>…</svg>` returned from a component, rather than a compiled static
template — was built with `document.createElement`, yielding HTML-namespaced
`HTMLUnknownElement`s (so `<svg>`/`<path>` didn't render and `clipPath` was
lowercased to `clippath`).

`reconcileDeoptNode`/`reconcileDeoptChildren` (and the component-bearing
`hostElementBody`) now open the SVG namespace at `<svg>` and inherit it through the
subtree, switching a `foreignObject`'s children back to HTML. Class assignment on the
de-opt path is also SVG-safe (`setAttribute('class', …)` for SVG, whose `className`
is a read-only `SVGAnimatedString`). The compiled template path is unchanged.
