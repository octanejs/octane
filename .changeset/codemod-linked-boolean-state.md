---
'@octanejs/codemod': patch
---

Convert a component's render-time update that keeps it mounted after opening to linked state when the codemod can preserve its input reads and its closed render returns null.
