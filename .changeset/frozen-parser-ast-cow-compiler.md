---
'octane': patch
---

The compiler no longer mutates the parsed module AST. Every transform over the
parser-owned tree — type stripping, arrow-component normalization, scoped-CSS
hashing and style maps, hook dependency inference and slotting annotations,
error-boundary lowering, profile instrumentation, and print-time TS stripping —
is now copy-on-write: changed spines are rebuilt with `@tsrx/core` builders and
untouched subtrees stay shared with the parse. Compiled output is byte-identical
and compile time is unchanged. The test suites enforce the invariant by
deep-freezing every adopted parser AST (`OCTANE_COMPILE_FROZEN_AST=1`), so any
in-place write fails loudly with the offending line.
