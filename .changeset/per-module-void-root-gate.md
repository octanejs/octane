---
'octane': patch
---

Keep same-module root, private Context and compiled `Hydrate` specializations in production builds that configure renderer boundaries. Only a module that renders a boundary tag now falls back to the generic paths, instead of every module in the project.
