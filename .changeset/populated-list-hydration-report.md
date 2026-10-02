---
'octane': patch
---

Hydrating an `@for` that the server rendered with items while the client has
none and builds its `@empty` arm now reports the rebuild through
`onRecoverableError`, in production as well as development. The development
diagnostic is still logged once, now also when a pending sibling replays the
hydration attempt. A dormant `<Hydrate>` boundary whose list emptied before it
activated rebuilds it without reporting.
