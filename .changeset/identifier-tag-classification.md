---
'octane': patch
---

Identifier JSX tags that don't start with a lowercase ASCII letter — `<_Inner/>`, `<$Inner/>` — now compile as component REFERENCES (`createElement(_Inner, …)`), matching JSX semantics (Babel/TS `isCompatTag`). Previously only `/^[A-Z]/` tags were components, so `_`/`$`-prefixed tags miscompiled to host string tags (`createElement('_Inner', …)`) on the client and invalid-tag errors or literal `<_inner>` markup on the server. Lowercase and dashed tags (`<div>`, `<my-element>`) stay host tags.
