---
'@octanejs/base-ui': patch
---

Port Base UI's `Toast` (Phase 3g).

`@octanejs/base-ui/toast` exposes the full `Toast` namespace — `Provider`,
`Viewport`, `Root`, `Content`, `Title`, `Description`, `Close`, `Action`,
`Portal`, `Positioner` and `Arrow` — plus `useToastManager` for driving toasts
from a component and `createToastManager` for driving them from outside one.

Toasts are created imperatively rather than by a trigger. The store owns the
list, each toast's auto-dismiss timer, and the rules for pausing those timers
while the viewport is hovered, focused, touched, or the window is in the
background. Toasts can be updated or upserted in place by id, a `loading` toast
opts out of auto-dismiss entirely, and the `promise` helper drives a toast
through loading → success or error. Toasts beyond the configured limit are
flagged rather than removed so they can animate out, and the viewport mirrors
high-priority toasts into a visually hidden assertive live region.

Swipe-to-dismiss is covered too: dragging past the threshold dismisses the toast,
dragging back below it springs back, and a drag starting on a button inside the
toast does not swipe it.
