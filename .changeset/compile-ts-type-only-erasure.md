---
'octane': patch
---

Fix `compile()` output for `.ts`, `.mts`, and `.cts` modules, including Valdi
custom hooks. The native parser returned these files without their type
information, so `import type`, inline `type` specifiers, `export type { … }`, and
`export type *` were emitted as value imports and exports that fail to link.
Parameter properties also lost their `this.x = x` assignment, and `declare`
fields became real fields. These modules are now parsed with TypeScript's own
grammar, which keeps all of that, and `<T>value` type assertions still parse.

Type erasure also covers two cases that broke `.tsx` and `.tsrx` output: type
arguments on a superclass (`extends Base<T>`), and re-exports of a name that is
only a type (`import type { T }` then `export { T }`). Both previously left
invalid JavaScript.
