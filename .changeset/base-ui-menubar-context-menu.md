---
'@octanejs/base-ui': patch
---

Port Base UI's `Menubar` and `ContextMenu` (Phase 3f stage 4), completing the menu family.

`@octanejs/base-ui/menubar` exposes `Menubar`, a container that turns a row of
`Menu.Root`s into one keyboard-navigable bar: its triggers become roving
composite menu items, opening one menu closes its sibling, and the bar reports
whether any of its menus is open so the others can open on hover.

`@octanejs/base-ui/context-menu` exposes `ContextMenu`, a menu opened by right
click or long press and anchored at the pointer rather than at an element. It
suppresses the browser's own context menu over its trigger, traps focus while
open, and ignores the mouse-up belonging to the gesture that opened it so the
item under the cursor is not activated by accident. Every part other than `Root`
and `Trigger` is `Menu`'s, re-exported through the namespace.

Both were the last consumers of code that shipped inert in the first Menu stage,
so the whole menu family — `Menu`, `Menubar`, `ContextMenu` — is now in place.
