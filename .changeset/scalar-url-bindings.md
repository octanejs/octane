---
'octane': patch
---

Fixed-node `'use dom bindings'` views that bind a URL attribute (`href`, `src`, `action`, `formAction`, `xlink:href`, …) now compile to the smaller scalar adopter, with the URL sanitizer attached only to those views. A URL view adopted through `adoptBindings` ships about 32% less gzip. URL updates published by an early binding are now kept when the application later hydrates over it, as other attributes already were, instead of being reverted to the rendered value.
