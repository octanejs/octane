---
'octane': patch
---

Applications that build host element descriptors ship a slightly smaller host
renderer. Its entry points are now separate bindings rather than fields of one
driver object, so a minifier can shorten their names.
