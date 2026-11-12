---
"@octanejs/codemod": patch
---

Keep keyed React lists as `.map()` when moving the key into an `@for` header could change the order of row setup and key evaluation.
