# Cloudflare Workers Migration Report

TanStack.com is configured as a Cloudflare Workers deployment for this branch. Netlify is no longer part of this site's hosting configuration, but Netlify remains available in builder/deploy-provider UX for users who choose it.

## Files Changed

- `package.json`, `pnpm-lock.yaml`: Cloudflare build/preview/deploy scripts, `@cloudflare/vite-plugin`, `wrangler`, `@tanstack/create@0.68.4`, and removal of Netlify hosting packages.
- `vite.config.ts`: Cloudflare Vite plugin, Worker build constants, opt-in image transformation flag, and server builder-generation enabled with the Worker-safe create API.
- `wrangler.jsonc`: Worker name/account, assets binding, `nodejs_compat`, CPU limit, cron triggers, and production `SITE_URL`.
- `src/server.ts`, `src/server/scheduled.server.ts`: Worker `fetch` and `scheduled` entrypoints, replacing former Netlify scheduled functions.
- `src/server/runtime/host.server.ts`, `src/utils/hosting-cache.server.ts`: host cache purge adapter using Cloudflare cache-tag purge.
- `src/components/OptimizedImage.tsx`, `src/utils/optimizedImage.ts`: host-neutral optimized image helper with Cloudflare image transformations behind an explicit build flag.
- `src/builder/api/create-worker.ts`: host-neutral adapter around `@tanstack/create/worker` with local Worker manifest loaders for supported frameworks and add-ons.
- `src/builder/api/*`, `src/routes/api/builder/*`: builder feature catalog, compile, download, validate, suggest, and GitHub deploy paths use the Worker-safe create adapter.
- `src/routes/*`, `src/utils/*`, `src/server/*`: CDN cache headers moved from Netlify-specific headers to Cloudflare Workers Cache headers / `Cache-Tag`.
- `src/utils/markdown/processor.ts`: site-side compatibility guard for escaped angle brackets in generated TypeDoc markdown until `@tanstack/markdown` handles `\<...\>` as escaped text.
- `package.json`, `pnpm-lock.yaml`: `@tanstack/markdown@0.0.5` for compact table delimiters, footnotes, and legacy single-tilde strike headings without the temporary pnpm patch.
- Removed hosting-only Netlify files: `netlify.toml`, `netlify/functions/*`, `scripts/run-built-server.mjs`.

## Commands Used

```bash
pnpm install --lockfile-only
pnpm add @tanstack/create@^0.68.4
pnpm run test:tsc
pnpm exec tsc --noEmit
pnpm run build:cloudflare
pnpm test
pnpm run dev:cloudflare
pnpm run deploy:cloudflare
pnpm run preview:cloudflare -- --host 127.0.0.1 --port 3001
pnpm install
```

Additional checks used `curl`, Node fetch scripts, Wrangler tail, and Playwright with system Chrome against the Workers preview URL.

## Deploy Cache Purge

`pnpm run deploy:cloudflare` builds, deploys the Worker, then runs `pnpm run purge:cloudflare`. The purge step clears the Cloudflare zone cache with `purge_everything` so stale HTML documents cannot keep pointing at removed route chunks after a deploy.

Required environment:

- `CLOUDFLARE_ZONE_ID`: the active `tanstack.com` zone ID.
- `CLOUDFLARE_CACHE_PURGE_TOKEN`: Cloudflare API token with `Cache Purge` permission for that zone.

`CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` and `CF_ZONE_ID` are accepted as aliases. If `CLOUDFLARE_ZONE_ID` is missing, the script can discover it only when the token also has zone read access.

## Worker

- Account: `8da95258a9c70b54c3e2b374a0079106`
- Worker: `tanstack-com`
- URL: `https://tanstack-com.thetanstack.workers.dev`
- Current version: `ff011a60-320b-43b7-9a03-bd650a41bc7b`
- Upload size: `17748.26 KiB` raw, `6413.10 KiB` gzip
- Startup time: `33 ms`
- Note: the secret-bearing `tanstack-com-staging` Worker was renamed to `tanstack-com`, and the older empty `tanstack-com` Worker was removed.

## Passed

- `pnpm run build:cloudflare` passed.
- `pnpm run test:tsc` passed.
- `pnpm test` passed with 10 existing oxlint warnings.
- Cloudflare deploy passed.
- Local Cloudflare preview started and returned 200 for `/` and `/builder`.
- `/` returned 200 HTML on the Worker.
- `/start/latest` returned 200 HTML on the Worker.
- Browser SPA navigation from `/` to `/start/latest` did not reproduce the `npm-recent-downloads ... data is undefined` error.
- `/builder` returned 200 HTML with COOP/COEP headers and loaded the client builder/integration surface.
- Primary homepage images loaded in browser on the Worker.
- `/api/og/query.png?title=Query&description=Smoke` returned a valid 1200x630 PNG.
- `/_a/gtag.js` returned Google's JavaScript.
- `/_a/g/collect` returned 204.
- `/auth/github/start?returnTo=/account` redirected to GitHub with secure state/return cookies.
- `/.well-known/oauth-authorization-server` returned OAuth metadata.
- `/api/mcp/` returned the expected unauthenticated JSON-RPC auth error instead of a runtime failure.
- `POST /api/application-starter/resolve` returned a Start recipe.
- `/api/builder/features?framework=react` returned the Worker-safe catalog, including `tanstack-query`, `cloudflare`, and `biome`.
- `/api/builder/compile` generated representative React and Solid projects server-side on the Worker.
- `/api/builder/download` returned a valid zip for a representative React builder project.
- `https://tanstack.com/api/builder/features?framework=react` returned the same Worker-safe builder catalog.
- `https://tanstack.com/builder` returned 200 HTML with COOP/COEP headers.
- Worker output does not include `generated/create-manifest.js` or a `create-manifest` chunk.
- Cloudflare dry-run/upload size stayed below the paid Worker 10 MiB gzip limit after excluding the heavy React `events` example implementation chunk.
- `Link` response headers for static assets are emitted on SSR responses for Cloudflare Early Hints fallback.
- Broad docs/blog audit generated 2,767 latest-doc/blog URLs from GitHub doc trees plus local blog posts and compared production vs Worker.
- Escaped generic headings in TypeDoc markdown now render correctly, e.g. `Interface: AudioAdapter<TModel, TProviderOptions>` with the production-compatible `interface-audioadaptertmodel-tprovideroptions` anchor.
- Local site parser checks now match the remaining markdown audit diffs:
  - `/ai/latest/docs/code-mode/code-mode` parses 4 content tables.
  - `/db/latest/docs/collections/powersync-collection` parses 24 content tables.
  - `/start/latest/docs/framework/react/migrate-from-next-js` headings render as `Server Actions Functions` and `Server Routes Handlers`.
  - `/blog/tanstack-router-signal-graph` renders footnotes with `data-footnotes` and production-compatible footnote anchors.
- Live Worker rechecks against production passed for the same table, heading, and footnote signals after deploying version `586b99ec-4a2c-46d2-b3b3-eb775de13141`.
- Three full-body rechecks of 43 URLs that intermittently returned Worker 500/timeout during the high-concurrency audit cleared; the only stable non-200s were `/hotkeys/latest/docs/reference` and `/pacer/latest/docs/reference`, both 404 on production and Worker.

## Failed Or Not Proven

- Full GitHub OAuth callback/account login was not completed.
- End-to-end GitHub repository deploy was not completed with a logged-in account.
- Cron trigger behavior was deployed but not manually invoked.
- The React `events` example is not exposed in the Worker builder catalog because its implementation chunk pushes the Worker over Cloudflare's paid 10 MiB gzip upload limit.
- High-concurrency audit runs can still produce transient Worker 500s with `{"status":500,"unhandled":true,"message":"HTTPError"}` on changing docs paths, but targeted full-body rechecks did not reproduce stable page failures. Treat this as a load/audit-cache risk, not a confirmed content regression.

## Builder Generation Note

`@tanstack/create@0.68.4` adds the lazy `@tanstack/create/worker` API. The site now imports that API through `src/builder/api/create-worker.ts` instead of importing `@tanstack/create/edge` from route logic.

`/api/builder/features` remains catalog-only by using `create.getFrameworkById` and `create.getAllAddOns`. ZIP/project generation loads only the requested framework/add-on chunks, then calls `create.finalizeAddOns`, `create.populateAddOnOptionsDefaults`, `createMemoryEnvironment`, and `create.createApp`.

The Worker build was checked for `generated/create-manifest.js` and `create-manifest` output, and no generated manifest bundle was present. Including the React `events` example implementation still pushed upload size to `11179.57 KiB` gzip, so the Worker loader intentionally omits that chunk. The deployed Worker is `6413.10 KiB` gzip.

## Image Transformation Note

Cloudflare image transformations are enabled for `build:cloudflare`. Transformed image URLs are emitted through the configured `SITE_URL` origin because `/cdn-cgi/image/*` works on the routed `tanstack.com` zone but still returns 404 on the `workers.dev` hostname.

## Markdown Audit Note

The new markdown renderer initially parsed escaped TypeDoc generics like `\<T\>` as inline HTML. The site now protects escaped `<` / `>` outside code fences and inline code before parsing, restores them into text nodes before render, and rebuilds headings so rendered content and ToC anchors stay aligned.

Resolved markdown differences from the broad audit:

- Escaped TypeDoc generics no longer become inline HTML.
- Compact markdown table delimiters like `:--:` now parse as tables, matching the existing production renderer.
- Blog footnotes now render with `data-footnotes`, `user-content-fn-*`, and `user-content-fnref-*` anchors.
- Legacy single-tilde strike headings now render without visible `~` markers.

Remaining markdown differences observed during audit:

- Production duplicates light/dark code blocks; the Worker branch renders one theme-aware code block. This explains large HTML-size and `<pre>` count differences.
- The temporary `@tanstack/markdown@0.0.4` pnpm patch has been removed after upgrading to `@tanstack/markdown@0.0.5`.

## Readiness

Core marketing SSR, docs/start navigation, security headers, static assets, analytics proxying, GitHub auth start, MCP auth rejection, application-starter API, scheduled Worker registration, Cloudflare preview, deploy, dynamic OG image generation, and representative Worker-side builder generation are working on Cloudflare Workers.

Production migration is close, but not fully safe until logged-in OAuth/account flows pass, cron jobs are verified, and an authenticated builder GitHub deploy is completed. The main remaining builder gap is the omitted React `events` example chunk.
