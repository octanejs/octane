---
'@octanejs/recharts': patch
---

Fix consumer production builds failing under Vite 8 + Rolldown with
`MISSING_EXPORT` errors.

Many internal modules imported type-only symbols (`export type` /
`export interface` declarations such as `ValueType`, `NameType`, `Payload`,
`SymbolType`) as runtime values. Rolldown now treats a missing runtime export as
a hard error, so any application bundling `@octanejs/recharts` failed at build
time.

All type-only imports are now declared with `import type` or inline `type`
modifiers, and the package enables `verbatimModuleSyntax` so the typecheck gates
regressions. No public API, props, or export map changed; the packed-consumer
canary in `check-package-packs` now covers the package.
