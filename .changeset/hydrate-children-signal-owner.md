---
'octane': patch
---

Resolve a component's `signal$`, `derived$` and `query$` handles to the component's own cells when the children it writes between `<Hydrate>` tags read them. `<Hydrate>` rendered those children in a frame of its own, in the browser and on the server, so `<Hydrate when={load()}>{record$.get()}</Hydrate>` started a second request for the query and a derived read computed from signals the component never updated. The fix covers inline boundaries (`split={false}`), the children the compiler splits into a module of their own, children forwarded into a boundary, deferred activation, and a permanently static `when={never()}` boundary on the server.
