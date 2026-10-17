---
'octane': minor
---

A descriptor list item (an array of `createElement` or `.tsx` children) now
serializes without a comment range of its own whenever it renders exactly one
host element and no component or portal inside it, as a compiled `@for` row with one
element does. A host whose children are other elements or arrays no longer
gets a range. Hydration decides the same from the item's value, so an item
that arrives in a range it does not need, as from an older server, is a
structural mismatch: the nearest Suspense or `<Hydrate>` boundary, or the root,
renders on the client and reports one recoverable error.
