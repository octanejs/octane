---
'@octanejs/cmdk': patch
---

Rank filtered results with CSS `order` instead of relocating DOM nodes, render
items that have not been scored yet, and key registration teardowns per item.

Previously an item mounted while a search was active never rendered unless it
carried an explicit `value`, ranking orphaned item nodes when they lived inside
a keyed `@for`, source order never came back after a search was cleared, and
removing the selected item alongside a sibling left nothing selected.
