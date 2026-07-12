---
'octane': patch
---

Fix: a compiled `{expr}` child hole skipped its update entirely when the value was identity-unchanged, which stranded context consumers below an identity-stable `{children}` passthrough under a re-rendering Provider (e.g. a router forwarding stable children through location providers on every navigation). Unchanged renderables (objects/functions) now still dispatch to childSlot — whose bail path lazily refreshes changed-context consumers — while unchanged primitives keep the inline skip.
