---
'octane': patch
---

Reconcile explicitly undefined native attributes when hydrating existing server markup. Direct attributes and native prop spreads now remove stale SSR values on the first client render instead of treating an empty client cache as an unchanged value. Preserve the adopted node and unrelated server attributes.
