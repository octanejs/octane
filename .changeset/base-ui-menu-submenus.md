---
'@octanejs/base-ui': patch
---

Port Base UI's `Menu` submenus (Phase 3f stage 3), completing the `menu` subpath.

`@octanejs/base-ui/menu` now also exposes `Menu.SubmenuRoot` and
`Menu.SubmenuTrigger`, ported from `@base-ui/react` 1.6.0 — all 20 of upstream's
`menu` parts are in place.

A `SubmenuTrigger` is simultaneously an item of its parent menu and the trigger
of its own, so it takes part in the parent's roving focus and typeahead while
opening and closing a nested menu of its own. Opening one activates the
sibling-close, parent-close and item-hover relays the positioner has carried
since the first stage: hovering a different item in the parent closes an open
branch, opening one submenu closes its siblings, and closing a parent closes its
children. Escape closes only the submenu unless `closeParentOnEsc` is set.
Nested menus place themselves at the inline end of their trigger and are marked
`data-nested`.

`Menubar` and `ContextMenu` are separate namespaces and are not part of this
change.
