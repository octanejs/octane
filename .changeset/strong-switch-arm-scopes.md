---
'octane': patch
---

Check Strong-mode `@switch` arms in their own lexical scopes so arm-local shadows and functions receive accurate render diagnostics without leaking bindings into sibling arms. Treat instance class field initializers as deferred work when a class is defined during render.
