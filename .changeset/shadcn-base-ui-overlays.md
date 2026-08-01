---
'@octanejs/shadcn': patch
---

Add `dialog`, `popover` and `tooltip` to the Base UI base.

Positioning is adapted rather than copied. Base UI inserts a Positioner layer
(`Portal > Positioner > Popup`) and publishes its transform origin as `--transform-origin`, where
Radix publishes `--radix-<part>-content-transform-origin`. A copied Radix class would reference a
variable nothing sets, so the popup would scale from the wrong corner on open — visible only in
motion. Tooltip additionally drops Radix's `data-[state=delayed-open]` utilities, which have no
Base UI counterpart.

`PopoverAnchor` is deliberately absent: Base UI positions through the Positioner's `anchor` prop
rather than rendering an Anchor element, so there is no part to port. Recorded as a known
divergence in the cross-base contract test.
