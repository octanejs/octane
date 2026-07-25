---
'octane': patch
---

Type-only/Volar compilation now emits renderer JSX pragmas as part of its
single mapped Program print and exposes that exact transformed Program as
`generatedAst` for editor and playground consumers. Client-only server stubs
are likewise built as origin-stamped AST, printed once with esrap, and return a
real source map plus the Program used to produce them.
