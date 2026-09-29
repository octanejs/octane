---
'octane': patch
---

Hydration now recovers when the browser's HTML parser has repaired
server-rendered markup, such as a `<div>` inside a `<p>`. The server wraps
such an element in a hydration range, so the parser's repair stays inside it.
The client rebuilds the element once, discards the nodes the parser split out,
and reports the recovery through `onRecoverableError`, with a development
hydration-mismatch warning. Previously the content appeared twice and the stale
copy stayed on screen, a later sibling's bindings could land on a stray node,
and a repaired element in the root component could blank the page. Hydrating an
element with component children where the server rendered nothing no longer
throws.
