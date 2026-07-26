---
'octane': patch
---

The compiler's copy-on-write AST rewriter no longer recurses into properties that
cannot be rewritten. Only object-valued properties can produce a replacement, but
every `type`, `name` and `raw` string was still passed to a recursive call that
returned it unchanged, which was 61% of the walk. Compiles are measurably faster
with byte-identical output.
