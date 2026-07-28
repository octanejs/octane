---
'@octanejs/cmdk': patch
'@octanejs/sonner': patch
'@octanejs/tiptap': patch
---

Fix strict TSRX typechecking of source-published command menus, toast notifications, and editors. Preserve typed optional refs, CSS custom properties, editor contexts, and portal registries, and validate all three bindings from their real packed packages with `tsrx-tsc`.
