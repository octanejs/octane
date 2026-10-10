---
'octane': patch
---

Optimize compiler-generated memo descriptor lists, context dependency recording,
and warm-plan setup while preserving keyed state and suspended-render rollback.
Skip a second keyed reconciliation pass for eligible zero- or one-descriptor
updates with stable keys and length, preserving the ordinary reconciler for other
changes.
