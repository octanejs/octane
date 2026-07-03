---
"octane": patch
---

Spread props now hydrate like direct bindings: `suppressHydrationWarning` and `class`.

A spread-supplied `suppressHydrationWarning` was written as a literal
`suppresshydrationwarning=""` DOM attribute — itself a guaranteed server/client
divergence, since SSR skips the key — and never armed the suppression. `setSpread` now
stamps the JS flag (before the other keys apply, so it's order-independent) exactly
like the compiler's direct-attribute binding and the de-opt paths. The spread `class`
fast path also bypassed hydration handling; it now routes through the hydration-aware
attribute class setter, so spread and SVG/MathML classes get the same
suppress/warn-and-patch semantics as an HTML `className` binding.
