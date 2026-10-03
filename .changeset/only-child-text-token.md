---
'octane': patch
---

Leave a signal-capable only-child text hole alone when its value is unchanged.

A `{props.value}` hole that is its element's only child compiles to
`bindSignalChild` whenever the value could carry a signal. That binding kept
the Text node as its token, so every render read the node's `nodeValue` to tell
an unchanged value from a changed one, and an unchanged value overwrote any
outside edit to the text. The binding now keeps the last written primitive, as
compiled text holes did before signal-capable bindings: an unchanged primitive
does nothing and leaves the DOM alone, and a changed one rewrites the same Text
node.
