---
'octane': patch
---

Type-check `.tsrx` files against a renderer's own intrinsics via a file-local `/** @jsxImportSource … */` pragma: `compileToVolarMappings` now recovers the pragma from the source's leading comments (which the virtual TSX otherwise strips) and re-emits it as the virtual-file prelude, with the same precedence TypeScript gives an in-file pragma over `compilerOptions`. Also export `TsrxErrorBoundary` — the name the language tooling's type-only virtual TSX imports for `@try`/`@catch` — with a function-typed `fallback` so authored `@catch (error)` bindings get contextual parameter types under `noImplicitAny`.
