---
'octane': patch
---

Add `modulePackage(code, id)` to the bundler compiler. It returns the package that owns a module and whether `transform` compiles the module or slots its hooks. `octane analyze --strong-dependencies` uses it.
