---
'@octanejs/shadcn': patch
---

Add `alert-dialog` to the Base UI base, at `@octanejs/shadcn/base-ui/AlertDialog`.

Transcribed from upstream's Base UI source and running on `@octanejs/base-ui`'s AlertDialog —
the first portalled family in this base. Upstream maps Overlay to Backdrop, Content to Popup, and
Cancel to Close. This port also maps Action to Close, with both actions composing a Button through
Base UI's render-as-element contract so confirming dismisses the dialog.

The overlay and popup use stable keys so Octane can reconcile the portal siblings by identity.

The title drops upstream's `cn-font-heading`, matching the React Aria base: this package ships
the default-Tailwind utilities-inlined flavor rather than the pinned `cn-*` semantic hooks, so
that class resolves to nothing here.
