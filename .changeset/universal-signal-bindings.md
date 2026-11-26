---
'octane': minor
---

Universal renderers can opt into signals with the `signal-bindings` capability. A signal handle passed as a host prop or rendered as a child binds that host: a write publishes one `update` command in a binding-only batch, coalesced per microtask, without rendering the component again. A signal read during render (`count$.get()`) subscribes the component when it commits and renders it again on change. Renderers without the capability still reject modules with a runtime signals import.
