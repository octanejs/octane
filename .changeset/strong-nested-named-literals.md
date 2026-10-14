---
'octane': patch
---

Retain eligible Strong object and array values created in setup when they are passed to props inside another component's children. Unrelated updates no longer restart subscriptions to those values. Inline child expressions still evaluate only when the child renders.
