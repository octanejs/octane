---
'octane': patch
---

Fix a custom `map` list row that keeps its key but changes from a single host
element to a component. The update used to throw `NotFoundError`. When a root
render held such a change, it could also drop the committed row until the render
committed, or leave the old row in the DOM after it did. The row now promotes to
a marked range before its host element is retired, and that retirement is undone
if the root render is held.
