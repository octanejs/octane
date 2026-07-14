---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rsbuild-plugin': patch
'@octanejs/vite-plugin': patch
'@octanejs/adapter-vercel': patch
'@octanejs/mcp-server': patch
---

Add a bundler-neutral Octane compiler and app core, a low-level Rspack 2
compiler integration, and a full Rsbuild 2 metaframework plugin with routing,
streaming SSR, hydration, HMR, production client/server builds, preview, and
adapter support. Keep the existing Vite integration on the same shared core.
