---
'octane': patch
---

Fix Rspack and Rsbuild development builds crashing while evaluating hot `.tsrx` modules by aliasing webpack HMR metadata before reading dispose data.
