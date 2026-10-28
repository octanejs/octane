---
'octane': patch
---

Avoid retrying a hidden, compiler-split `Hydrate` child on parent updates while its first module is still loading. The child reveals with the latest props when the module settles.
