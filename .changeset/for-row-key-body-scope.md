---
'octane': patch
---

The compiler now rejects an `@for` row `key={…}` attribute that reads a class,
an enum, or a `var` hoisted out of a nested block in the row body. Before, only
top-level `const`, `let`, `var` and `function` declarations were caught, so
such a key compiled to a key function that threw a `ReferenceError` or silently
read an outer binding of the same name. The check now resolves the key's names
by scope, so a name the key binds itself, such as a callback parameter, still
compiles.
