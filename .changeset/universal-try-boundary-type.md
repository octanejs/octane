---
'octane': patch
---

Type-check `@try`/`@catch` in `.tsrx` files for universal renderers such as
`@octanejs/ink`. Their JSX accepts only components that return a
`UniversalRenderable`, and the `TsrxErrorBoundary` that type checking uses for
`@try` returned `unknown`, so TypeScript rejected the boundary in every such
file. It now returns `never`, which every renderer's JSX accepts. Runtime output
does not change.
