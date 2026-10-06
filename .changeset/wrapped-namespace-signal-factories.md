---
'octane': patch
---

Recognize signal factories accessed through a type-asserted namespace, such as `(signals as typeof signals).query$(select, load)`. These calls now keep their compiler-assigned signal identity and run producers for the correct reader in components, plain hooks, SSR, and hydration. Explicit keyed scopes and shadowed imports retain their existing behavior.
