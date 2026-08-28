---
'octane': patch
---

Reuse normalized renderer configuration and compiled filename matchers across
TSRX module classifications. Compiler integrations that retain normalized
options no longer repeat renderer validation, signature serialization, brace
expansion, and regular-expression construction for every source file.
