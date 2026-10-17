---
'octane': patch
---

A server render now collects the signal values it reads for the hydration
snapshot whenever the application uses signals. Before, it collected only once
a module that reads signals had loaded somewhere in the server process, so the
same page could render with or without its snapshot. Hydration then presents
the server's value and applies the client's newer one as an update, as React
hydrates a `useSyncExternalStore` value from `getServerSnapshot`: a control
keeps its server node, focus and any captured command, instead of rendering on
the client. A signal the server's snapshot of a scope lacks is read live during
hydration, suspending while it is pending, as it is when there is no snapshot.
A page that reads no signals still adds no snapshot.
