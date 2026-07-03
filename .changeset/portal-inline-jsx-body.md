---
"octane": patch
---

Compiler: `createPortal(<div …>…</div>, target)` with an inline JSX element (or
fragment) body at JSX child position now compiles.

React's most common portal authoring shape previously printed the raw JSX verbatim
into the emitted `portal()` call — invalid output reaching the bundler. The inline
body is now hoisted into a sub-template render fn (the same lowering as an `@if`
branch body), landing on the same `portal()` fast path as the documented
`() => @{ … }` arrow form.
