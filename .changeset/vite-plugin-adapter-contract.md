---
'@octanejs/vite-plugin': patch
---

octane.config `adapter` is now the full deploy contract `{ name?, adapt?, serve?, runtime? }`: after the production server build, closeBundle runs `adapter.adapt({ root, outDir, clientDir, serverDir, log })` so an adapter package (e.g. `@octanejs/adapter-vercel`) can restructure the output for its platform (SvelteKit-style). All parts are optional and independent — `serve`/`runtime` keep their existing meanings. `@octanejs/adapter-vercel` is registered as a server-only package: client-side imports of it resolve to the browser stub (which now also covers the octane adapter surface, `vercel`/`adapt`) instead of dragging node builtins into the client graph.
