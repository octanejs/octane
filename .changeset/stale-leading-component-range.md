---
'octane': patch
---

Remove the server range that hydration left behind when a stale node, such as one a browser extension inserted, stood before a component's range in an element. The client rebuilt the component but kept the server's copy too, so the component's content appeared twice.
