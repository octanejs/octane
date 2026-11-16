---
'octane': patch
---

Make a component that reads signals while rendering cheaper to re-render: a render that reads the sources its committed render read keeps the committed subscriptions instead of taking and releasing its own.
