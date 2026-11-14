---
'@octanejs/codemod': patch
---

Apply the map callback parameter checks to array literals with spreads. Block writes when converting these callbacks to `@for` would change a parameter assignment or when its binding pattern could read the index too early.
