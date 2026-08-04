---
'@octanejs/base-ui': patch
---

Key two array-children sites the previous pass missed, both on the modal popup path.

`Popover`'s positioner composes its internal backdrop beside the floating node, and
`FloatingFocusManager` composes its inside focus guards around the consumer's children. Neither
array was keyed, so a MODAL popover, dialog or menu still emitted Octane's missing-key warning. Only
the modal path renders a backdrop and guards, which is why the non-modal fixtures used to verify the
first pass stayed silent.

The regression test now settles effects before collecting warnings. Reading them synchronously
missed both, because these slots only mount from an effect — the first version of that test passed
with the keys removed.
