---
'octane': patch
---

Allow `adoptBindings(element, View, source)` to resolve an eligible composite view that returns another view through exact adjacent compiler-owned wrappers. Preserve native node identity and existing binding lifetimes while rejecting ambiguous, mismatched, or sibling-containing ranges.
