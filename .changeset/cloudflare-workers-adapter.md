---
'@octanejs/adapter-cloudflare': patch
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
'@octanejs/mcp-server': patch
'octane': patch
---

Add a Cloudflare Workers adapter for full-stack Octane apps. Vite and Rsbuild
can now emit a Worker-targeted server bundle and a streaming module Worker for
Workers Static Assets, with Cloudflare bindings and execution context available
through request-scoped middleware and server-route context.

Initialize streaming SSR token entropy on the first render so module evaluation
remains valid in runtimes that prohibit random generation in global scope.
