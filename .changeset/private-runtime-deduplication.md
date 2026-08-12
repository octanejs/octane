---
'octane': patch
---

Reduce duplicated client, server, and universal-renderer logic while sharing
specialized compiled ref and server-spread helpers through renderer-isolated
private runtime entry points. Preserve existing public helper exports, ref
cleanup semantics, server rendering, hydration, and hot-path specializations.
