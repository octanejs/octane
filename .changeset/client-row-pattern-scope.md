---
'octane': patch
---

Fix a client `@for` header default or computed key that names something the row body declares (`{ value = prefix }` beside a body `const prefix`). It now reads the outer binding, as a `for…of` header does and as server rendering already did, instead of throwing a `ReferenceError` or reading the body's value. Rows whose header pattern calls `eval` are fixed too, and a row body's `class` declaration no longer collides with a captured outer binding of the same name.
