---
'octane': patch
---

A lone pure-host descriptor at a value position (e.g. `createElement('div')` returned from a pass-through component or rendered at a root) now mounts ANCHORLESS — no comment markers, the element self-delimits, mirroring the singleRoot component regime. `container.firstChild` is the element itself (React/RTL parity) instead of a comment anchor. A later render that flips the slot's value to another mode (text, null, array, component, portal) promotes the slot to the marked regime in place.
