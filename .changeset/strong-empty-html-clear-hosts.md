---
'octane': patch
---

Strong mode now accepts `node.innerHTML = ''` on any self-closing ordinary HTML element (not only a root `div`) whose single local ref proves ownership, when only plain HTML elements sit between it and the component root.
