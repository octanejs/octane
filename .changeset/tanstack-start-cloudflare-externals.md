---
'@octanejs/tanstack-start': patch
---

Export `cloudflareExternals()` from `@octanejs/tanstack-start/plugin/vite`. Compose it for Cloudflare-targeted deployments to externalize `cloudflare:*` modules (e.g. `cloudflare:workers`) in the server build, where the workerd runtime provides them. It only externalizes server-runtime modules — it does not supply a local Cloudflare runtime or deployment integration.
