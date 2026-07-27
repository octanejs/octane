---
'@octanejs/base-ui': patch
---

Port Base UI's `Menu` open/close + roving-focus path (Phase 3f stage 1).

`@octanejs/base-ui/menu` now exposes `Menu.Root`, `Menu.Trigger`, `Menu.Portal`,
`Menu.Positioner`, `Menu.Popup`, `Menu.createHandle` and `Menu.Handle`, ported
from `@base-ui/react` 1.6.0's `menu/store`, `menu/root`, `menu/trigger`,
`menu/portal`, `menu/positioner` and `menu/popup`. A dropdown menu opens on
press, hover or an arrow key, dismisses on Escape or an outside press, moves
focus into the popup and returns it to the trigger, and positions itself with
the same `@floating-ui` middleware stack Base UI uses. Detached triggers work
through `Menu.createHandle()`.

This is the first consumer of the list-navigation and typeahead layer, so
`useListNavigation` and `useTypeahead` are now exercised by differential parity
against the real `@base-ui/react` rather than only ported.

Supporting additions: `useOpenInteractionType`, the `DROPDOWN_COLLISION_AVOIDANCE`
/ `TYPEAHEAD_RESET_MS` / `PATIENT_CLICK_THRESHOLD` constants, `findRootOwnerId`,
and the `cancel-open` / `sibling-open` change reasons.

Menu items, submenus, `Menu.Viewport`/`Arrow`/`Backdrop`/`Separator`, `Menubar`
and `ContextMenu` are not part of this change and land in the following stages.
