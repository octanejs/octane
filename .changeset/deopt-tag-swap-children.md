---
'octane': patch
---

Fix children loss when a value-position host descriptor changes its tag: the
de-opt renderer recreated the element but preserved the children slot, whose
markers and content lived inside the removed element, so children-block
children (e.g. a styled-components-style `createElement(props.tag, { children })`)
kept rendering into the detached node. The recreate path now tears the slot
down so children remount into the fresh element, matching React's remount
semantics for a host tag change.
