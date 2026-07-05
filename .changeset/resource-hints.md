---
'octane': patch
---

Resource hints land (React DOM parity): `preload`, `preinit`, `preconnect`, and `prefetchDNS`, exported from `octane` and mirrored in `octane/server`. Client calls insert deduped `<link>`/async-`<script>` tags into `document.head`; server calls collect into the render's head output (flushed with the streaming shell). A shared `data-oct-hint` dedupe key means a hydrating client call for an SSR-emitted resource is a no-op.
