---
'octane': patch
'@octanejs/tanstack-router': patch
---

Enable Strong mode for Router's hook and store adapters while preserving their
authored hook slots and production memo optimization. Allow manually slotted Strong
modules to use the existing memo lowering when no generated declaration cache is
required.
