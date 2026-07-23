---
'octane': patch
---

The client compiler now assembles imports, templates, styles, event delegation,
hoisted helpers, component declarations, HMR, profiling, and metadata tails into
one module AST and prints it once with esrap. Module source maps now come directly
from that print, including generated helper regions that the previous
string-stitching path could not map.
