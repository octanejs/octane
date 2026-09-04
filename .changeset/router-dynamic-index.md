---
'@octanejs/app-core': patch
---

Index dynamic routes by their last static segment so parameter and catch-all matching is O(candidates that share that spine) instead of a linear RegExp scan, while preserving specificity and equal-spec insertion order.
