---
'@octanejs/shadcn': patch
---

Export `sidebarMenuButtonVariants` from the Base UI base's `sidebar`.

That base types `asChild` as `never` on `SidebarMenuButton` and documents this helper as the
substitute for it, but the helper was declared non-exported — faithful to the Radix source, which
does not need it because it still has `asChild`. The documented workaround was therefore
unreachable. Every sibling family in this base already exports its cva map (`badge`, `item`,
`toggle`), so this also brings `sidebar` in line with them.
