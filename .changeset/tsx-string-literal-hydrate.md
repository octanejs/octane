---
"octane": patch
---

Fold `.tsx` string-literal expression children such as Prettier's `{" "}` into the client template, matching the server and `.tsrx` compilers so hydration no longer duplicates the following element.
