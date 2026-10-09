---
'octane': patch
---

`hostComponent` now creates its element in the namespace of the node it is inserted into, as descriptor and dynamic host tags already do. A `motion.circle` inside an `<svg>`, or a `motion.svg` in HTML, now renders as an SVG element instead of an unknown HTML element.
