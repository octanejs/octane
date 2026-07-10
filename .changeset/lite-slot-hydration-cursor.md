---
'octane': patch
---

Hydration: `componentSlotLite` now advances the hydration cursor past its adopted `<!--[-->…<!--]-->` range after its body renders (mirroring `componentSlot`'s post-render advance). Before, a hookless component followed by a SIBLING hookless component in the same children block left the cursor parked on its adopted root, so the next slot adopted no range, its commit insert MOVED the previous sibling's element to the shared end anchor, and the second component's server DOM was stranded — multi-child `{children}` hierarchies (`<Box><Box/><Box/></Box>`) did not hydrate byte-stably. Nested and multi-child component hierarchies now adopt server markup byte-for-byte.
