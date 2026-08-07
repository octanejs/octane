---
'octane': patch
---

Detach a removed subtree's DOM once instead of once per block.

Tearing down a block removed its own DOM range node by node, and it passed that
same instruction to every block underneath it. So removing a route did the work
once per block: with roughly 5000 blocks in a depth-10 tree, thousands of
`removeChild` calls on nodes that the enclosing range removal was about to take
anyway. A block that removes an enclosing range now tears its descendants down
with `detachDom: false`, which is the same thing the batched list clears already
did, and leaves one range removal to take the nodes.

Anything whose DOM lives outside that range still detaches itself: portals force
`detachDom` back on in the slot walk, and a `createPortal` value hole goes
through its own teardown. Cleanup order is unchanged, and the range stays
attached while cleanups run, so a layout-effect cleanup still observes its
children's nodes.

Measured with `benchmarks/spa-navigation` (20 iterations, same machine and
command, medians in ms): a 1024-leaf route teardown drops from 1.30 to 0.60, a
full route swap from 2.40 to 1.90, and the same swap under 6x CPU throttling
from 16.70 to 12.60. Mount is untouched at 1.60 against 1.70, inside its own
spread.
