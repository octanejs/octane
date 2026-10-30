---
'@octanejs/base-ui': patch
'@octanejs/base-ui-utils': patch
'@octanejs/testing-library': patch
---

Correct the documented Octane requirement. The READMEs and migration guide still
said these packages need Octane 0.2.5 in the 0.2 line. They peer on the current
Octane minor line, as their `peerDependencies` state.
