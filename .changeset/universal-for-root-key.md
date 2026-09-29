---
'octane': patch
---

Universal renderers now treat a React-style `key` attribute on the only root of
an `@for` row as the row key, exactly as the DOM renderer does. It takes
precedence over a header key and compiles byte for byte like
`@for (…; key expr)`, for intrinsic, component and Activity roots. Before,
universal renderers read only the header, so a row keyed by its root attribute
fell back to a positional key: its state followed the slot rather than the item
across reorders, and the attribute stayed on the root as a separate key that
kept the row off the static-prop, owner-free and template-program row lowerings.
A root key that reads a name declared inside the row body is now a compile
error.
