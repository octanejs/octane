---
'octane': patch
---

The compiler now rejects `for…in` and C-style `@for` headers on every target.
`@for (const k in object)` used to compile as `for…of` over the object on the
DOM client, server, and universal renderers, rendering its values or nothing
instead of its keys. `@for (let i = 0; i < n; i++)` crashed the DOM compiler
with an internal `TypeError`. Each now reports a diagnostic at the directive
that suggests the `for…of` spelling, such as
`@for (const name of Object.keys(object); key name)`.
