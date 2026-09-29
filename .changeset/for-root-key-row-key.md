---
'octane': patch
---

A React-style `key` attribute on the only root of an `@for` row now compiles
exactly like the header spelling `@for (…; key expr)`, for intrinsic and
component roots alike. Before, an intrinsic root whose content read anything
not provably stable, such as `{props.render(row)}`, was lowered to a keyed
element descriptor. That cost about five times as much per update, and because
the row was still treated as a single node, removing or reordering such rows
left stale elements behind. A component root lost its row memo. The compiler
now also rejects a row key that reads a declaration from inside the loop body,
which previously failed at runtime with a `ReferenceError`.
