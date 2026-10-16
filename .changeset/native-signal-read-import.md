---
'octane': patch
---

Report `OCTANE_NATIVE_SIGNAL_IMPORT` when the compiler can identify a native signal read during rendering in a module without a signals runtime import. Add `import 'octane/signals';` to the consuming module when no named signals API is needed.
