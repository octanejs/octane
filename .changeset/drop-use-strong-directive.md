---
'octane': patch
---

Compiled client and server modules no longer carry the `"use strong"` directive.
It only selects Strong compile-time checks, and Rolldown warned
`MODULE_LEVEL_DIRECTIVE` once for every Strong module in production builds.
Other authored directives keep their place in the module prologue, now also in
modules that declare `signal$`, `derived$`, or `query$` values.
