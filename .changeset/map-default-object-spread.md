---
"@octanejs/codemod": patch
---

Block JSX map conversions when copying a fresh object literal leads a parameter default to read the callback index before initialization.
