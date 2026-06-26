---
'octane': patch
---

Fix `innerHTML={expr}` rendering as a dead lowercased `innerhtml` attribute (and an
empty element) when the element also carries a spread, e.g.
`<div {...stylex.props(x)} innerHTML={html} />`. With a spread the dedicated
html-child fast path can't be used and the binding is routed through `setAttribute`,
which now correctly assigns the `innerHTML` property instead of adding an attribute.
