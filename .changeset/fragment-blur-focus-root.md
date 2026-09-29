---
'octane': patch
---

Fix `FragmentInstance.blur()` for owned children focused inside a shadow root or a same-origin iframe portal. It now checks each child's own focus root instead of only the fragment marker's document.
