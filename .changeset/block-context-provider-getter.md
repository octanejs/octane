---
"@octanejs/codemod": patch
---

Refuse to migrate a local React context's Provider JSX when a direct module-level Object.defineProperty call defines its getter earlier in the same source file.
