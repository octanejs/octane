---
'octane': patch
---

Add compiler-backed adoption of fixed server-rendered DOM views through `adoptBindings` from `octane/behavior`. Opted-in views synchronously project an owned snapshot onto existing native elements without loading the renderer, replacing nodes, or taking over application event handlers. Unsupported structural authoring fails explicitly.
