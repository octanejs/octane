---
'octane': patch
---

Preserve type-only imports when the Node compiler falls back to the native parser for TypeScript modules. Compiled modules can now load without a runtime dependency on files or exports used only as types.
