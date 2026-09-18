---
'octane': patch
---

Keep native-only DOM presentation initialization separate from control and grouped-projection capabilities, so initializer-only compiled views do not retain unrelated host-operation helpers. Preserve initialization order, early edits, and older mount/adoption capability overrides.
