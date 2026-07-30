---
'@octanejs/phosphor-icons': patch
---

Key the SVG primitives each icon renders, so mounting one no longer warns.

Every icon passes its weight's primitives to `createElement` as a single array
child, and octane treats an array child as a keyed list. Without keys it
reconciled them by position and warned on every icon:

```
Octane: each element in an array child should have a unique "key" prop
```

Upstream never hits this — `@phosphor-icons/react` stores one `ReactElement`
per weight, so React only ever sees a single child. This port stores
`[tag, attributes]` tuples instead, to keep the generated icons
tree-shakeable, which makes the keys this package's responsibility.

A weight's primitives are a fixed, never-reordered sequence, so the index is
their identity; pairing it with the tag means switching weight reuses a node
where the element type matches at that position and replaces it where it does
not, rather than patching a `<path>` into a `<circle>`.
