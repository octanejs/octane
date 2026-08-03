---
'@octanejs/shadcn': patch
---

Add `sheet` to the Base UI base, at `@octanejs/shadcn/base-ui/Sheet`.

Runs on `@octanejs/base-ui`'s Dialog, mapping Overlay to Backdrop and Content to Popup, with the
close affordance composed through Base UI's render-as-element contract. The title drops upstream's
`cn-font-heading`, matching this base's dialog and alert-dialog.

The `data-[side=…]` variants carry no dialect risk: that attribute is written by the component
rather than emitted by the primitive.
