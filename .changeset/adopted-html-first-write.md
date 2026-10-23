---
'octane': patch
---

Keep an adopted `dangerouslySetInnerHTML`'s server nodes on the first render
after hydration when its HTML already serializes to the render's `__html`
string, as React 19.3 does, instead of reparsing and replacing them. Hydration
still compares nothing in production, and mismatched HTML is still rewritten.
