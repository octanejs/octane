---
'@octanejs/shadcn': patch
---

Add `context-menu` to the Base UI base, at `@octanejs/shadcn/base-ui/ContextMenu`. That base now
covers 36 of 44 families.

Runs on `@octanejs/base-ui`'s `ContextMenu`, reusing the dialects established for `dropdown-menu` and
re-verified against this primitive: the CSS variables are the generic `--available-height` and
`--transform-origin` rather than Radix's per-component names; the submenu trigger marks itself open
with `data-popup-open`, not the popup's `data-open`; `Label` stays a plain `<div>` because
`ContextMenu.GroupLabel` requires a `Group` ancestor; and Radix's `focus:` item utilities carry over
because Base UI moves real DOM focus onto the highlighted item.

One improvement over `dropdown-menu`: `ContextMenu` ships a real `Separator` part, which `Menu` does
not, so the separator is the primitive here and brings its `role="separator"` and `aria-orientation`
with it.

Positioning props are routed to the Positioner rather than swept onto the Popup, matching the fix
applied to the other Base UI overlays.
