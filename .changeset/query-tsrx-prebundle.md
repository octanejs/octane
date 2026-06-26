---
"@octanejs/vite-plugin": patch
---

Exclude `@octanejs/query` from esbuild pre-bundling (optimizeDeps.exclude + ssr.noExternal). It ships a `.tsrx` provider component, so — like `octane` itself — its source must flow through the octane `.tsrx` transform rather than being pre-bundled by esbuild.
