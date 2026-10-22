---
'octane': patch
---

Preserve authored module directive prologues before generated imports and setup
in client and server compiler output. Compiled Strong modules can pass through a
subsequent compiler transform without a misplaced `"use strong"` diagnostic.
