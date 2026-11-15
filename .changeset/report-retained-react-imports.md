---
"@octanejs/codemod": patch
---

Report React imports that the codemod keeps under their original renderer. Direct blocked hooks and context reads to their React renderer without claiming that no Octane binding exists.
