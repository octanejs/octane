---
'octane': patch
---

Type-check `<input ref={a} {...props} />` in `.tsrx` when `props` has an index
signature, such as `Record<string, unknown>`, as TSX does. Type checking
composes the explicit ref with the spread's `ref`, and a `ref` that only the
index signature admitted was read as `unknown` and rejected. It now counts as
absent; a declared `ref` in the spread is still checked. Runtime output does not
change.
