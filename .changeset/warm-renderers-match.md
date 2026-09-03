---
'@octanejs/lynx': patch
---

Support owner-bound warm metadata in the main-thread renderer so compiler-emitted
Lynx components continue to build and copied component statics cannot warm an
unrelated wrapper.
