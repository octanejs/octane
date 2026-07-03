---
"octane": patch
---

`createPortal` content targeting an octane-managed element now survives the owner's re-renders.

The raw de-opt reconciler assumed full ownership of its element's live children — a
portal's whole `<!--portal-->…<!--/portal-->` range was removed on the target owner's
next re-render (Radix Toast portals each toast into the viewport list; every provider
re-render deleted all toasts). Portal ranges are now tagged and treated as FOREIGN:
the reconciler's reuse, removal, and reorder passes all skip them, so portal content
coexists with the container's rendered children exactly like React portals.
