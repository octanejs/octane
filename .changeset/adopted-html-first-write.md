---
'octane': patch
---

Keep an adopted `dangerouslySetInnerHTML`'s server nodes after hydration until
a render passes a different `__html` string, as React 19.3 does, instead of
reparsing and replacing them on the first render. This includes server HTML
that differs from the client's; development still warns about it at hydration.
