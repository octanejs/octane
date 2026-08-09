---
'@octanejs/tanstack-start': patch
---

Fall through to `env.ASSETS.fetch` when the default server entry returns a 404, so Cloudflare deployments serve the client bundle and other static assets instead of SSR 404 HTML.
