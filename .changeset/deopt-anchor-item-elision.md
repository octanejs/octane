---
'octane': patch
---

Marker elision M4: two client-mount elisions for descriptor-heavy trees (charts, de-opt lists). A `{expr}` hole that is its element's SOLE child now hands the element to an owns-parent childSlot — component/element values render with no anchor comment at all (previously one comment per hole). And pure single-element items in de-opt keyed lists (value-position `.map()` arrays) now self-mark — the rendered element is the item's own range marker, eliding the per-item `<!--it-->` pair; component-bearing, null, and primitive items keep their pair, and an item whose value later stops fitting one element promotes to a minted pair in place (one-way). SSR output and hydration adoption are unchanged; a recharts-style page drops roughly a sixth of its total comment nodes on top of M2/M3.
