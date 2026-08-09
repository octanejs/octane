---
'octane': patch
---

Unmount teardown now removes a deleted subtree's DOM once at the outermost
detached block instead of per-descendant range (portals still self-detach from
their foreign targets), and the de-opt ref-detach walk is skipped for subtrees
that never stamped a descriptor ref. A full-page teardown drops from thousands
of `removeChild` calls to one per top-level node, and deletion cleanups now
observe the entire deleted subtree still attached — matching React's
commitDeletionEffects order.
