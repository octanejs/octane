---
'octane': patch
---

Fix hydration of an empty `{x as string}` text hole that shares its parent with other nodes, such as `<p>{b as string}<After /></p>` with `b = ''`. The server now emits a one-node `<!---->` stand-in for the empty hole, so later siblings are claimed at the right position. Previously the following component was rebuilt or duplicated, and in some shapes the whole root was left empty. Hydration recovery also no longer removes nodes outside the block being recovered, so a misaligned claim cannot blank its host.
