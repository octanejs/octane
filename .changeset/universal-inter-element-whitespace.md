---
'octane': patch
---

Keep a same-line space between sibling elements in universal plans the way the DOM template does. `<span>a</span> <span>b</span>` now renders "a b" instead of "ab" on renderers whose hosts parent text, and `<p> <span>x</span> </p>` keeps its edge spaces. Whitespace that contains a line break is still removed, and renderers that reject text or limit its parents (`textParents`) still drop the space where text is not allowed, so `<mesh /> <mesh />` stays legal.
