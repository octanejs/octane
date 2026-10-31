---
'@octanejs/tiptap': patch
---

`@tiptap/core` and `@tiptap/pm` are now peer dependencies (`^3.28.0`), as they are for `@tiptap/react`, so the binding uses the application's copy. Before, an app on another TipTap release got the binding's own pinned 3.28.0 copy as well, loaded ProseMirror twice, and threw `RangeError: Adding different instances of a keyed plugin` when the editor mounted. The optional `@tiptap/extension-bubble-menu` and `@tiptap/extension-floating-menu` now use `^3.28.0`, upstream's range, instead of an exact pin, so they resolve alongside the app's TipTap release. Install `@tiptap/core` and `@tiptap/pm` next to `@octanejs/tiptap` if your app does not already have them.
