---
'octane': patch
---

When hydration builds a component on the client because the server rendered no range for it, it now discards only the server nodes in that component's place and leaves the server range of a later sibling call for that call to adopt. Previously the discard ran into the sibling's range, removed its content and left a stray close marker behind, so the sibling rebuilt without a report of its own. The built component also stays ahead of those siblings instead of being placed at the end of its parent range.
