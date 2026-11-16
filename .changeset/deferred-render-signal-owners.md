---
'octane': patch
---

Make components that use no signals cheaper once `octane/signals` is loaded. A component no longer creates its signal owner on its first render: it creates one the first time its render declares, reads or binds a signal, and an event handler or the children it passes record the component until then. Trees where few components read signals mount, hydrate and re-render faster and allocate less. Ownership, retries and streamed values are unchanged.
