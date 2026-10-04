---
'octane': patch
---

`collectDiagnostics` no longer prepares and analyzes a module a second time when Strong accepts it. It continues compiling from the tree that Strong analysis already checked, so `octane analyze` costs about the same as `compile()` on Strong modules instead of up to 1.26 times as much. It reports the same diagnostics and errors as before.
