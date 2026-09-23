---
'octane': patch
---

Compile TypeScript enums, value namespaces, import aliases, and class parameter
properties in `.tsrx` modules to plain JavaScript.

Vite does not run its TypeScript transform on `.tsrx`, so the compiler's output
has to be JavaScript already. Before this change an `enum` or value `namespace`
was printed as written, and `vite build` stopped with `[PARSE_ERROR] Unexpected
token`. A `constructor(private x)` parameter property lost its assignment
without any error.

These declarations now compile to the same JavaScript tsc produces for an
ES2022 target:

- Enums get numeric auto-increment, reverse mappings for non-string members,
  constant folding and self-references, `export enum`, and declaration merging.
  A `const enum` is emitted as a regular enum, which is what `preserveConstEnums`
  and isolated-module builds do.
- Value namespaces cover exported variables, functions, classes, and nested
  enums and namespaces, dotted names such as `namespace A.B`, and merging across
  blocks and with functions or classes.
- `import X = A.B` becomes a variable, and it is dropped when nothing reads it.
- Parameter properties are declared as class fields and assigned in the
  constructor, after `super(…)` in a derived class.

Abstract members, index signatures, and method overload signatures are no longer
printed into the output either.

Some constructs have no ES-module equivalent and now fail with a compiler
diagnostic instead of a bundler parse error: `export =`, `import x =
require(…)`, a destructured export inside a namespace, and an enum member without
an initializer when the member before it is not a constant number.
