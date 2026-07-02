---
"octane": patch
---

Style declarations dropped between renders are now removed on de-opt-patched elements.

`patchDeoptProps` reused the fresh-element prop applier for `style`, which passes no
previous value into `setStyle` — so a declaration present in one render's style
object and absent from the next was never removed from the reused element (Radix
Slider's thumb kept its pre-measurement `display: none` forever). The patch path
now threads the real previous style so dropped keys are diffed away.
