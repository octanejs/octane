---
'@octanejs/codemod': patch
---

Preserve child descriptors when a component passes its children to a local inspection helper. Preserve mapped JSX children at directly imported, selected components. Keep the original `className` on nested intrinsic descriptors so inspectors can read it.
