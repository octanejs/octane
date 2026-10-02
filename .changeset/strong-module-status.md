---
'octane': patch
---

Expose the bundler compiler's per-module Strong decision as `strongModuleStatus(code, id)`.

It reports whether a module compiles under Strong mode through its own
`"use strong"` directive, the application's `strong` policy, or both, using the
same rules `transform` applies. `octane analyze` uses it for its Strong coverage
baseline. `octane/compiler/bundler` also re-exports
`findLeadingJsxImportSourcePragma`. Compiled output is unchanged.
