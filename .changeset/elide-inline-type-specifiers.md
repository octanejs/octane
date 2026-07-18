---
'octane': patch
---

Elide inline `type` specifiers (`import { a, type B }`, `export { type C, d }`) from compiled output the way tsc does. Previously the specifier leaked into the emitted JS — as an invalid `type` keyword or a runtime import of a binding that only exists as a type — breaking module loading; a declaration left with no specifiers is now dropped entirely.
