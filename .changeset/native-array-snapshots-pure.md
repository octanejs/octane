---
'octane': patch
---

Drop the native array snapshots from client and server bundles that never map a
list. Both runtimes record `Array.prototype.map` and the `Array[Symbol.species]`
getter when they load, so a mapped list can tell the native `map` from one that
user code installs later. Bundlers could not prove those two reads free of side
effects. Every bundle that never reached the mapped-list code therefore kept
them as dead top-level statements, including a server bundle that only escapes
HTML.

The reads are now marked pure, so bundlers remove them when nothing uses them.
A bundle that maps a list still takes both snapshots at load, before user code
can replace either intrinsic. A minimal client bundle shrinks by 89 bytes raw,
and the smallest server bundle shrinks from 654 to 571 bytes raw.
