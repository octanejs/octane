---
'@octanejs/base-ui': patch
---

Key the array children the primitives compose, so rendering them stops emitting Octane's
missing-key warning.

Several primitives hand Octane an ARRAY child to place a fixed set of siblings — a rendered root
beside a visually-hidden input, a focus guard beside a portal. Octane reconciles an array as a keyed
list, so every entry needs a key; without one it warns in development and can rematch the wrong node
on reorder. The warning fired for every overlay and form control: dialog, sheet, alert-dialog,
popover, checkbox, switch, radio and slider.

Fixed in `checkbox`, `switch`, `radio`, `number-field`, `meter`, `progress`, `slider`, `dialog`,
`utils/FloatingPortalLite` and `utils/floating/FloatingPortal`. These arrays are positional and
fixed-arity, so a literal key per slot is correct; values that cannot be keyed in place — a
consumer's `children`, an already-built descriptor — go through a keyed Fragment, the pattern `menu`,
`popover` and `toast` already used.
