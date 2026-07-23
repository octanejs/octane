---
'octane': patch
---

The client compiler's module source map now covers render-plan expressions:
event handlers (including compiled event bundles), dynamic text holes,
attribute/class/style bindings, controlled-form and `dangerouslySetInnerHTML`
values, refs, spreads, `@if`/ternary conditions, `@for` iterables, `@switch`
discriminants and case tests, component props and keys, and portal
expressions all map from the emitted positions (mount and update paths alike)
back to their authored source. Emitted code is byte-identical — only the map
gains segments — improving devtools debugging, error-stack resolution, and
chained maps such as MDX's two-stage `.mdx` map. Module-scope hoisted helper
bodies and the server (SSR) emit keep their previous mapping density for now.
