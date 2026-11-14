---
'octane': patch
---

Skip pending passive effects when a running effect deletes its React-hosted Octane island, and still run the cleanup returned by that effect.
