---
'octane': patch
---

Let renderer-free structural bindings omit control, grouped-style/class, and native-initialization orchestration when their compiled view cannot use it. Preserve existing behavior for views that need these features and for older compiled descriptors.
