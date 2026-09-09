---
'octane': patch
---

Keep the first resolved context provider inline on each consumer, allocating a
provider cache Map only when that consumer reads a second distinct context.
Continue reading provider values live through updates and hosted-root changes.
