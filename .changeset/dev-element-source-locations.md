---
'octane': minor
---

Report the source location of every host element in development.

Dev-compiled templates now stamp each element they create, static ones
included, with the full module id and the line and column of its opening tag.
The devtools hook reads it back with `__OCTANE_DEVTOOLS__.sourceFor(element)`,
which returns `{ file, line, column }`, or `null` for elements no template
created. Under the Vite plugin `file` is relative to the project root, so files
with the same name in different folders are told apart. Inspectors and visual
editors can map any element to the line that wrote it without guessing from a
neighbouring element. Production output is unchanged.
