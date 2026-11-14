---
"@octanejs/codemod": patch
---

Block JSX map conversions when a safe `void` expression is followed by a read of the uninitialized callback index in a parameter default.
