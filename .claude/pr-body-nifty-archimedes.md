# vite-plugin: close the four gaps the website surfaced + streaming dev SSR

## What

Fixes the four `@octanejs/vite-plugin` gaps the website app surfaced (and had workarounds for), switches dev SSR to streaming, and simplifies `website/` to consume the fixed plugin directly.

### Plugin fixes (`packages/vite-plugin-octane`)

1. **`exclude` option** — `octane()` now accepts `exclude` and forwards it to its bundled compiler, so monorepo/aliased-to-source setups can skip the `.ts` hook-slotting pass for hand-slot-forwarding binding sources (pnpm symlinks resolve `@octanejs/*` to `packages/*/src`, invisible to the automatic node_modules skip).
2. **Vite-owned URL filter** — the dev SSR middleware skips `/@` namespaces, `/__` internals, node_modules, extension-bearing module/asset paths, and `?import`-style transform queries before route matching (exported as `isViteOwnedUrl`). A catch-all `'/*splat'` RenderRoute can now SSR a real not-found page; the new `RenderRoute` `status` option (e.g. `404`) puts the right status on it.
3. **`appType` respect** — `'custom'` is only a default now: an explicit user `appType` wins, and `vite preview` keeps Vite's own SPA fallback so it serves the client build (production SSR serving remains Phase 2).
4. **`url` prop + `preHydrate` hook** — RenderRoute components (and layouts) receive `{ params, url }` (pathname + search, identical string server/client), and `router.preHydrate` names a Vite-root module whose default export the generated client entry awaits before `hydrateRoot` — the hook an app-level client router uses to commit its match tree so hydration adopts the server DOM.

**Subtle bug found while verifying 4:** Vite's import-analysis rewrites the generated entry's variable dynamic imports to append `?import`, and the queried URL evaluates as a *second* browser module instance — the preHydrate hook was waiting on a duplicate router singleton while the app rendered the statically-imported one (hydration mismatch, rebuilt tree). The entry now hides its dynamic imports from the rewrite (`new Function('s','return import(s)')`) so module singletons stay shared.

### Stretch: streaming dev SSR

`handleRenderRoute` renders through `renderToReadableStream` instead of buffered `prerender`: the template prefix + shell flush immediately, suspense boundaries stream out of order behind it, and the hydration script rides the template suffix (so all segments are in the DOM before the entry loads). Shell errors still produce the dev 500 page. `docs/ssr.md`'s stale "streaming is not built" section is rewritten around the real streaming API.

Core fix required: **`hydrateRoot()` skips leading `<style data-octane>` tags** when positioning the adoption cursor — a streamed shell flushes scoped styles ahead of the body markup, which previously broke hydration of any streamed page using scoped `<style>`.

### Website simplification

- Drops the `octaneMeta()[1]` + own-compiler split (uses `octane({ exclude })`).
- Drops the after-plugin `appType` flip.
- Adds the `'/*splat'` catch-all route with `status: 404`.
- Deletes the `AppEntry.ts` top-level-await trick: `App` reads `props.url` directly and `router-client.ts` default-exports the preHydrate hook.
- `mdx-plugin.ts` stays (separate package concern).

## Testing

- New `vite-plugin` vitest project (`packages/vite-plugin-octane/tests/plugin.test.ts`): URL filter, `exclude` forwarding, `appType` defaulting, `preHydrate`/`status` config resolution.
- New streaming test: shell with leading style tags hydrates by adoption (also fixed the harness to compile the server fixture under the same absolute path as the client — the scoped-class hash is filename-derived, so the ids must agree).
- Manually verified the dev server: `/`, `/docs`, `/docs/:slug` SSR + hydrate with zero console errors; unknown URLs return HTTP 404 with the SSR'd shell; `/@vite/client` and `/src/**` pass through to Vite; client-side nav works; `vite build && vite preview` serves the SPA build.
- `pnpm test` (324 files, 2283 passed, 5 expected-fail GAP pins), `pnpm typecheck`, `pnpm format:check` all green.

Changesets included for `octane` and `@octanejs/vite-plugin` (patch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
