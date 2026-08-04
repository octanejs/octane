---
'@octanejs/shadcn': patch
---

Route positioning props to the Positioner in the Base UI base's `dropdown-menu`, `popover` and
`tooltip`.

Radix exposes one `Content` element that accepts every positioning prop; Base UI splits positioning
into its own layer, and these components only forwarded `align` and `sideOffset` to it. Everything
else — `side`, `alignOffset`, `collisionPadding`, `sticky` and the rest — was swept onto `Popup` by
the rest spread, where it is inert: `side="top"` silently left the overlay on its default side, and
the prop also reached the DOM as an invalid attribute.

They are now destructured and forwarded explicitly. `dropdown-menu`'s sub-content had the same split
and is fixed with it.
