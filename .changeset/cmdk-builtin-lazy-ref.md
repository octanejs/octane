---
'@octanejs/cmdk': patch
---

Use Octane's built-in `useLazyRef` for the command store and scheduler refs instead of a local helper that wrote `ref.current` during render.
