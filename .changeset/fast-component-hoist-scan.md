---
'octane': patch
---

Index component references once when compiling component-heavy modules.

Component declaration lowering now preserves the same client and server hoisting
semantics without repeatedly sanitizing and scanning every growing source prefix.
