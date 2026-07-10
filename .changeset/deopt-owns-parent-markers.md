---
'octane': patch
---

Marker elision M2: de-opt host elements (descriptor-tree children, `.ts` `createElement` hosts) hand their content to a single owns-parent childSlot — no comment markers minted at all (inserts append, clears sweep the element), and component-bearing de-opt list items borrow their own `<!--it-->` pair instead of nesting a second one. Deep descriptor trees (e.g. charts) render with a fraction of the comment nodes; SSR output is unchanged.
