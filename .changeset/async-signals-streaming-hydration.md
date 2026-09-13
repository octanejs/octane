---
'octane': patch
'@octanejs/cli': patch
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
'@octanejs/adapter-cloudflare': patch
'@octanejs/zag': patch
'@octanejs/to-print': patch
---

Add owner-bound signal declarations, async derivations and keyed streams, direct native signal bindings, and independent hydration infrastructure. Add request-local server-call context, bounded streamed RPC, and explicitly batched independent reads. Preserve operation identity and cancellation boundaries across navigation and uncertain acknowledgements.

Allow a later widget activation to retry a failed framework-loaded stylesheet
without discarding queued interactions or revealing the widget before CSS loads.

Support renderer-free global signal and streamed-state activation for hosts that
retain server-owned HTML. Adopt initial document seeds before behavior reads,
preserve early edits, bind native control properties without reconciliation, and
let envelope owners emit the early capture script before interactive markup
without duplicating it in rendered fragments.

Catalog the new core runtime diagnostics while preserving their error classes,
and verify the published streaming bootstrap subpath and inline script export.

Keep individual and batched server calls on the page's origin when an authored
base element points to another origin.

Keep reusable DOM, CSS, and component prop types scalar while allowing direct
signal bindings at native JSX sites, preserving existing binding consumers.
Use scalar public props for Zag's state-machine normalization results and
to-print's imperative iframe options.
