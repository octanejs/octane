---
'octane': patch
---

Render a `useDeferredValue` final value while a root with no Suspense boundary holds its first render on the initial value, and commit whichever is ready first, as React does.
