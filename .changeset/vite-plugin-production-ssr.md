---
'@octanejs/vite-plugin': patch
---

Production SSR builds — octane apps now deploy server-rendered instead of SPA-only:

- `vite build` produces BOTH bundles: hashed client assets in `{outDir}/client` (with the generated hydrate entry bundled into index.html via a static, Rollup-analyzable import map over the routes' entry/layout/preHydrate modules) and a self-contained SSR server at `{outDir}/server/entry.js` (app + octane bundled, only node builtins external; octane.config.ts is compiled in through a config-surface facade so neither the compiler nor vite ride along). The built index.html moves to `dist/server` — it is the SSR template, and leaving it in the static dir would shadow the handler at `/` on filesystem-first hosts.
- `createHandler` (`@octanejs/vite-plugin/production`) is implemented: it matches RenderRoutes/ServerRoutes, runs middleware chains, and streams via the same `renderToReadableStream` engine dev SSR uses — the rendered body region and the `#__octane_data` payload are byte-identical to dev, so `hydrateRoot()` adopts production responses unchanged (covered by an end-to-end fixture test). Per-route `<link rel="stylesheet">`/`modulepreload` tags come from the client manifest. `server.render: 'buffered'` in octane.config.ts switches to the await-everything `prerender` for hosts that break streamed responses.
- The server entry exports `handler` (Web fetch) and `nodeHandler` (Node `(req, res)`, for serverless wrappers such as a Vercel Node function), and auto-boots under `node dist/server/entry.js` — with the adapter's `serve()` when configured, else the new built-in Node server (`@octanejs/vite-plugin/node`) serving the client assets with immutable caching for `/assets/*`.
- `octane-preview` now runs that entry for real (pre-deploy verification) and accepts `--port`.
