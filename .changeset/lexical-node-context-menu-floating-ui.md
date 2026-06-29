---
"@octanejs/lexical": patch
---

`NodeContextMenuPlugin` is now a faithful 1:1 port of `@lexical/react`, built on
`@octanejs/floating-ui` (`useFloating`/`useRole`/`useDismiss`/`useListNavigation`/
`useTypeahead`/`useInteractions` + `FloatingPortal`/`FloatingOverlay`/
`FloatingFocusManager`) instead of the interim hand-rolled `@floating-ui/dom`
re-implementation. `@octanejs/lexical` now depends on `@octanejs/floating-ui`.
