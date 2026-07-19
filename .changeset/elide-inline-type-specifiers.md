---
'octane': patch
---

Elide inline `type` specifiers (`import { a, type B }`, `export { type C, d }`) and type-only star re-exports (`export type * from '…'`, `export type * as Ns from '…'`) from compiled output the way tsc does. Previously these leaked into the emitted JS — as an invalid `type` keyword or a runtime import/re-export of bindings that only exist as types — breaking module loading; a declaration left with no specifiers is now dropped entirely.
