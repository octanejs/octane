---
'@octanejs/shadcn': patch
---

Add `sidebar` to the Base UI base, at `@octanejs/shadcn/base-ui/Sidebar`. That base now covers 39 of
44 families, and every family whose primitives exist is now ported.

It composes this base's own button, input, separator, sheet, skeleton and tooltip, so it inherits
their dialects — the sheet's transition motion, the separator's `aria-orientation` — without further
work.

The menu button's tooltip is composed with `render`. Radix writes
`<TooltipTrigger asChild>{button}</TooltipTrigger>`, where Slot merges the trigger onto its child;
Base UI has no Slot, and `Tooltip.Trigger` takes a `render` element that merges the same way. Passing
the button as children instead makes the trigger render its own `<button>` with the menu button
nested inside it — invalid markup that breaks click and focus behaviour, and which a count or text
assertion does not catch.

`asChild` is typed `never` on the five parts that accept it in the Radix base — `SidebarGroupLabel`,
`SidebarGroupAction`, `SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuSubButton`. Each renders
a plain host element, so there is no primitive whose `render` prop to borrow, and nothing settles
which spelling upstream's Base UI sidebar uses. That gap matters more here than elsewhere:
`<SidebarMenuButton asChild>` wrapping a router link is the ordinary way to build a nav. Until the
upstream source settles it, put the link inside the button or apply
`sidebarMenuButtonVariants({ variant, size })` to your own element.
