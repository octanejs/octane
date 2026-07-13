---
'octane': patch
---

Reduce client DOM bookkeeping for anchored lists, inactive conditionals,
`@empty` bodies, and compiler-proven single-root component or conditional keyed
items while preserving the existing SSR and hydration range protocol.
