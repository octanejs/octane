---
'@octanejs/shadcn': patch
---

Add `menubar` to the Base UI base, at `@octanejs/shadcn/base-ui/Menubar`. That base now covers 37 of
44 families.

Radix nests the whole family under one `Menubar` namespace; Base UI has a `Menubar` component for the
bar only, and each menu inside is the same `Menu` primitive `dropdown-menu` runs on. So the menu
parts reuse that family's verified dialects: the generic `--transform-origin` variable,
`data-popup-open` on the submenu trigger, plain host elements for `Label` and `Separator` (the `Menu`
namespace has no Separator part and its `GroupLabel` requires a `Group` ancestor), and Radix's
`focus:` utilities carrying over because Base UI moves real DOM focus.

The bar trigger is the one departure: its Radix class keys off `aria-expanded:bg-muted` rather than a
data attribute, and Base UI publishes `aria-expanded="true"` on an open trigger, so that one carries
over unchanged. The `data-popup-open` rewrite applies only to the submenu trigger.
