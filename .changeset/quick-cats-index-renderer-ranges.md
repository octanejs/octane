---
'octane': patch
---

Speed up TSRX universal renderer validation by indexing authored source ranges
before walking the AST. Validation diagnostics and compiled output are unchanged.
