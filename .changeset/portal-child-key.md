---
'octane': patch
---

Remount a portal's child element when its key or type changes.

`createPortal(<Editor key={id} />, target)` kept the same component instance when `id` changed, so its DOM and any value typed into an uncontrolled input survived a keyed reset. Switching the child between component types, or between a host element and a component, reused the old DOM the same way. The portal now remounts its child for a new key or element type, as React does. An unchanged key and type still preserve the child, and the portal's own third-argument key works as before.
