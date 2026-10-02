---
'octane': patch
---

When hydration rebuilds an `@for` that the server rendered with no items because
the client has items, the development diagnostic says the server rendered
`an empty list (@empty)` only when the server rendered that arm. A list without
an `@empty` arm now reports `an empty list`.
