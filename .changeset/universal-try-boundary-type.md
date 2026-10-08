---
'octane': patch
---

Type-check `@try` in `.tsrx` files for universal renderers such as
`@octanejs/ink`. Type checking renders `@try` as a `<Suspense>` (for
`@pending`) and a `<TsrxErrorBoundary>` (for `@catch`), imported from `octane`,
whose DOM component types return `void` and `unknown`. A universal renderer's
JSX accepts only components that return a `UniversalRenderable`, so TypeScript
rejected the boundaries in every such file. Type checking now imports
renderer-neutral stand-ins from the new type-only `octane/tsrx-boundary`
subpath. Runtime output does not change.
