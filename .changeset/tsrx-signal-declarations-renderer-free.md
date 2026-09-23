---
'octane': patch
---

Keep `.tsrx` modules that only declare signals renderer-free, as plain `.ts`
modules already were. They previously activated the renderer's native-read
driver on load, so a renderer-free consumer such as `adoptBindings` bundled the
renderer (about 24 KB gzip in a measured example). Modules that render signal
reads still activate native reads themselves through their documented
`octane/signals` import; a component that reads signals during render without
that import no longer relies on the declaring module to activate them.
