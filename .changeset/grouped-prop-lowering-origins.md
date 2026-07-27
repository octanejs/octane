---
'octane': patch
---

`compile({ inspect: true })` now also claims the authored attribute NAME for the
two lowerings that resolve an element's props as a GROUP, rather than one call
per attribute. Both dropped the name on the way out, leaving common controlled
form props unreachable from the output in the forward direction.

A host with a spread, a duplicate prop, or a `value`/`defaultValue` cascade
routes every prop through one commit-phase collector —
`setHostPropSources(el, [[false, 'defaultValue', …]])` — where the per-source
name literal is the only token that names its attribute. It now carries the
authored name instead of the element's location, the same split
`ssrAttrs`/`ssrInputAttrs` rows already made on the server.

Server-side `<textarea>`/`<select>` `value`/`defaultValue` never serialize as
attributes at all: they become the content-position `ssrTextareaValue(…)` or
option-projection `ssrSelectScope(…)` call, which takes its writers
POSITIONALLY, so there is no name literal and the helper alias is the only token
there is. It is now anchored on the authored name, and when both writers are
present the second aliases onto the first — one call cannot carry two locations.

The emitted module is byte-identical with and without `inspect`, and unchanged
from before this fix.
