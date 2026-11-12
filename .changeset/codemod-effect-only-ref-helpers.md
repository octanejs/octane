---
"@octanejs/codemod": patch
---

Move ref-only helpers into an effect when all of their calls belong to that effect, preserving the original setup and cleanup behavior.
