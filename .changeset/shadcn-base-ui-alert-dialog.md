---
'@octanejs/shadcn': patch
---

Add `alert-dialog` to the Base UI base, at `@octanejs/shadcn/base-ui/AlertDialog`.

Transcribed from upstream's Base UI source and running on `@octanejs/base-ui`'s AlertDialog —
the first portalled family in this base. Part mapping is upstream's: Overlay to Backdrop,
Content to Popup, Cancel to Close, with Cancel composing a Button through Base UI's
render-as-element contract.

The title drops upstream's `cn-font-heading`, matching the React Aria base: this package ships
the default-Tailwind utilities-inlined flavor rather than the pinned `cn-*` semantic hooks, so
that class resolves to nothing here.
