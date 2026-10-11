---
'octane': patch
---

Stop server-rendered `<ViewTransition>` from wrapping `.tsx` element children in an extra hydration range, which made every such boundary mismatch on hydration and regenerate on the client.
