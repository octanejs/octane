---
'octane': patch
---

The compiler's `__block` reference scan no longer recurses into non-object node
properties and stops as soon as it finds a match. Compiler output is
byte-identical. The walk itself does 44% fewer recursive calls, though it is a
small share of total compile time, so expect a marginal build-time effect rather
than a visible one.
