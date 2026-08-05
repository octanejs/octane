---
'@octanejs/shadcn': patch
---

Add `item` to the Base UI base, at `@octanejs/shadcn/base-ui/Item`. That base now covers 34 of 44
families.

Ten of the eleven parts are plain host elements; the eleventh, `ItemSeparator`, delegates to this
base's own `Separator` and so picks up Base UI's `aria-orientation` dialect rather than Radix's
`data-orientation`. The `data-[size=…]` and `data-[variant=…]` utilities look like the ones that
caught `toggle` and `slider`, but they read attributes the component writes itself, so they carry
across unchanged.

`Item` ships without its `asChild` escape hatch, matching `badge` and `breadcrumb` in this base:
Radix swaps in `Slot`, React Aria takes a `render` function, and Base UI has neither plus no
primitive here to borrow a `render` prop from. Consumers needing a different element can apply
`itemVariants({ variant, size })` directly.
