---
'@octanejs/radix': patch
---

Speed up DOM-order reads for large Radix collections by indexing each node's position once per
read instead of repeatedly scanning the ordered node list while sorting.
