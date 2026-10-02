---
'octane': patch
---

Compile a bare-left `@for (item of items)` or `@for ({ id } of items)` header instead of crashing. Each row binds its own item, as a `let` header does, and shadows any outer name, on the DOM client, the server, hydration, split `<Hydrate>` boundaries, and the universal and Valdi renderers. A header that would assign an existing target, such as `@for (obj.x of items)`, now reports a located compile error.
