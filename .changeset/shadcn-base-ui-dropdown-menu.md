---
'@octanejs/shadcn': patch
---

Add `dropdown-menu` to the Base UI base, at `@octanejs/shadcn/base-ui/DropdownMenu`. That base now
covers 35 of 44 families.

Runs on `@octanejs/base-ui`'s `Menu`, with positioning split out the way this base's `popover`
already does: `Root > Portal > Positioner > Popup`, where the Positioner owns align and sideOffset.

Three differences were verified against the rendered DOM rather than inferred:

- Three CSS variables are renamed. Radix publishes per-component names, Base UI's Positioner
  publishes generic ones — `--available-height`, `--anchor-width` and `--transform-origin`. A
  utility pointing at a variable nothing sets does nothing, silently.
- The submenu trigger marks itself open with `data-popup-open`, not the `data-open` the popup
  carries, so Radix's `data-open:bg-accent` would leave an open submenu's parent row unhighlighted.
- `Label` and `Separator` are plain host elements. `Menu.GroupLabel` throws
  "MenuGroupContext is missing" outside a `Menu.Group` while shadcn's label is used standalone, and
  the `Menu` namespace ships no Separator part at all.

Radix's `focus:` highlight utilities carry over unchanged: Base UI moves real DOM focus onto the
highlighted item as well as publishing `data-highlighted`.
