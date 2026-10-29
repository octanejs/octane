---
'octane': patch
---

The `OctaneCompat` host (`div[data-octane-compat]`) is now styled `display: contents` on the client and the server, as the `ReactCompat` host already is, so it no longer adds a layout box. The island's own root element is now the flex or grid item. A shrinkable flex child, for example, sizes and truncates as it would without the island, where before it could overflow its row. An island whose root element is inline now flows inline with its siblings. To keep a box around an island, wrap it in your own element.
