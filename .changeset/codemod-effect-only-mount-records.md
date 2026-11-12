---
'@octanejs/codemod': patch
---

Migrate a lazily initialized React state record whose value is consumed only by effects to a lazy ref in Strong mode. The record retains its original identity and effect dependency behavior through updates and cleanup.
