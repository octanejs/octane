---
'octane': patch
---

Reuse unchanged derived JSX descriptor arrays inside context providers, avoiding
unnecessary keyed reconciliation and memo comparisons while preserving context
updates, component state, and hydration.
