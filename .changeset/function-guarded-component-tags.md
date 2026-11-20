---
'octane': patch
---

A `const` component tag rendered inside `@if (typeof Tag === 'function')` (or an `@else if` or plain `if` with that test) now compiles to the function-only component slot. Since the tag can't be a host string there, an application that renders runtime-chosen components this way no longer ships the generic slot's host-tag renderer.
