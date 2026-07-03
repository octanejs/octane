---
"octane": patch
---

Compiler: a valueless `key` attribute inside `@for` no longer crashes the compile.

`@for (…) { <li key>…</li> }` hit a TypeError dereferencing the missing
attribute value in the legacy key-attribute extraction. A bare `key` carries no
expression, so it is now skipped (matching the component-slot `key` handling)
and the `@for` falls back to the header key / index / `x.id ?? x` default.
