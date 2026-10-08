---
'@octanejs/vaul': patch
'@octanejs/sonner': patch
'@octanejs/image-crop': patch
---

Declare the stylesheet each package imports for its side effect, so an application typechecking these sources with TypeScript 6 or 7 (which check side-effect imports by default) no longer reports TS2882.
