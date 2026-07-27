---
'@octanejs/base-ui': patch
---

Port Base UI's `Menu` item family (Phase 3f stage 2).

`@octanejs/base-ui/menu` now also exposes `Menu.Item`, `Menu.LinkItem`,
`Menu.CheckboxItem` + `Menu.CheckboxItemIndicator`, `Menu.RadioGroup` /
`Menu.RadioItem` + `Menu.RadioItemIndicator`, `Menu.Group` /
`Menu.GroupLabel`, `Menu.Separator`, `Menu.Arrow`, `Menu.Backdrop` and
`Menu.Viewport` — 18 of upstream's 20 `menu` parts, ported from
`@base-ui/react` 1.6.0.

A menu now has content to navigate, so the list-navigation and typeahead layer
is exercised end-to-end for the first time: arrow keys and Home/End rove
`data-highlighted` and the roving `tabindex` between items, and typing matches
item labels, buffering across keystrokes until the typeahead reset interval
elapses. Checkbox and radio items expose their state as the
`data-checked`/`data-unchecked` attribute pair with transition-mounted
indicators, and `Group`/`RadioGroup` wire `aria-labelledby` to their
`GroupLabel`.

Submenus, `Menubar` and `ContextMenu` are not part of this change and land in
the following stages.
