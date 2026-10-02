---
'octane': patch
---

A `'use dom bindings'` view whose text leaf casts a signal handle to `number` (`{count$ as number}`, or a handle passed through props) now server-renders the handle's text, so `adoptBindings` can adopt its own SSR output instead of throwing a mismatched-topology error. The ordinary renderer hydrates the same output in place.
