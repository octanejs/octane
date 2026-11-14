---
"@octanejs/codemod": patch
---

Refuse to write a map conversion when moving the callback into a row can change its access to `this`, `arguments`, or `new.target`.
