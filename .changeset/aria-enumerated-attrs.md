---
"octane": patch
---

React parity: `aria-*` attributes are now treated as ENUMERATED, not boolean.

`aria-expanded={false}` now renders `aria-expanded="false"` (was: attribute removed) and
`aria-expanded={true}` renders `aria-expanded="true"` (was: `aria-expanded=""`), matching
React — only `null`/`undefined` removes an `aria-*` attribute. Applied consistently on the
client (`setAttribute`, and therefore the de-opt/spread paths) and in SSR (`ssrAttr`), so
server and client agree and accessibility state serialises correctly.
