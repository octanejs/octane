---
'@octanejs/base-ui': patch
---

Extend the Base UI port with the hover/focus interaction layer, the popup
viewport, and six new components.

- New components: `Button`, `DirectionProvider`, `CSPProvider`, `useMediaQuery`,
  `Tooltip` and `PreviewCard`.
- New parts on existing components: `Dialog.Viewport` and `Popover.Viewport`.
- `openOnHover` on `Popover` now works. It previously accepted the prop and did
  nothing, because the hover interaction was stubbed.

Also fixes a `Popover.Root` faithfulness bug: it rendered its interaction
component as a wrapper around the children rather than as a sibling, so the
wrapper's type changed on every open and rebuilt the whole subtree — including
the trigger, whose event listeners and store registration were left pointing at
a detached element. `Dialog.Root` used the same wrapper shape and now renders the
interactions as a sibling too, matching Base UI.
