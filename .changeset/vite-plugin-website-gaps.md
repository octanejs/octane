---
'@octanejs/vite-plugin': patch
---

Close the four metaframework gaps the octane website surfaced:

- `octane()` now accepts `exclude` and forwards it to the bundled compiler, so monorepo / aliased-to-source setups can skip the hook-slotting pass for hand-slot-forwarding binding sources (pnpm symlinks resolve `@octanejs/*` to `packages/*/src`, which the automatic node_modules skip can't see).
- The dev SSR middleware skips Vite-owned requests (`/@` namespaces, `/__` internals, node_modules, extension-bearing module/asset paths, `?import`-style transform queries) before route matching, so a catch-all `'/*splat'` RenderRoute can SSR a real not-found page without swallowing `/@vite/client` or `/src/*.ts`. `RenderRoute` also takes a `status` (e.g. 404 for the catch-all) applied to the rendered response.
- `appType: 'custom'` is now only a default: an explicit user `appType` wins, and `vite preview` is left on Vite's own SPA fallback so it can serve the client build (production SSR serving is still Phase 2).
- RenderRoute components (and layouts) receive the request `url` (pathname + search) alongside `params`, on the server and on the hydrating client, and the new `router.preHydrate` config names a module whose default export the client entry awaits before `hydrateRoot` — the hook an app-level client router uses to commit its match tree so hydration adopts the server DOM. The generated client entry also hides its dynamic imports from Vite's `?import` query injection so the page/hook share module singletons with statically-imported copies.

Dev SSR now streams: RenderRoutes render through `renderToReadableStream` (shell first, suspense boundaries flush out of order behind it) instead of the buffered `prerender`.
