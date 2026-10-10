---
'octane': patch
---

Avoid generating async warm plans for proven context reads and providers that
add no async work to start early. Preserve authored context reads and warming
for async descendants, opaque components, and reassigned context bindings.
