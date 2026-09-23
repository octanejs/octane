---
'octane': patch
---

Load compiled `.ts` and `.tsx` modules with Bun's TypeScript loader in
`octane/compiler/register`.

Compiled output for a `.ts` or `.tsx` source keeps the TypeScript constructs that
have runtime semantics, such as `enum`. Vite's TypeScript transform consumes the
same output. The Bun preload used to hand this output to Bun as plain
JavaScript, so a component module that declared an `enum` failed with a syntax
error. It now keeps the source file's loader. Compiled `.tsrx` output is still
loaded as JavaScript.
