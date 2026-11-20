---
'octane': patch
---

Allow watched signal setup and cleanup to publish synchronous updates when an observed derived value changes dependencies. The first observer now reads the updated value through derived signals, and keyless derived readers recover when a failing dependency becomes ready.
