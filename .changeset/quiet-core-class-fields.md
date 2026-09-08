---
'octane': patch
---

Avoid redundant emitted class-field definitions when constructing client blocks and scopes. Their existing constructors retain the same fields and property order while initializing them once.
