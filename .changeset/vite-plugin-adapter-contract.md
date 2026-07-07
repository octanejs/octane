---
'@octanejs/vite-plugin': patch
---

octane.config `adapter` is now the full deploy contract `{ name?, adapt?, serve?, runtime? }`: after the production server build, closeBundle runs `adapter.adapt({ root, outDir, clientDir, serverDir, log })` so an adapter package (e.g. `@octanejs/adapter-vercel`) can restructure the output for its platform (SvelteKit-style). All parts are optional and independent — `serve`/`runtime` keep their existing meanings.
