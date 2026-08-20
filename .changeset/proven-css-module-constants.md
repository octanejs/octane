---
'octane': patch
'@octanejs/vite-plugin': patch
---

Fold provider-proven immutable CSS-module class strings before template planning. Production Vite builds retain a live class reference in each static subtree so unused and lazy component styles keep their existing delivery boundaries. Mutable default maps remain dynamic unless their CSS provider supplies an explicit immutable-export contract.
