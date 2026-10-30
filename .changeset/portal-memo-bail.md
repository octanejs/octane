---
'octane': patch
---

A `memo()` component rendered as a portal's child now skips its render when the portal is created again with equal props, as React does and as `memo()` children elsewhere already did.
