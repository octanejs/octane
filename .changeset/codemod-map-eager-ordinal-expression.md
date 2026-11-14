---
'@octanejs/codemod': patch
---

Refuse map-to-`@for` writes when a parameter default reads the later index through an eagerly evaluated property access, receiver, or call argument.
