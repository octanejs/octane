---
'octane': patch
---

Server rendering no longer throws `Cannot access 'index' before initialization` when an unkeyed `@for` item pattern reads its index together with a name the row body declares (`{ value = prefix + index }` beside a body `const prefix`), or calls `eval`. The server binds the index first and moves the row body into its own block, so the pattern still resolves names outside the body, as a `for…of` header does.
