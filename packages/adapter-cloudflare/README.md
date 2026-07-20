# `@octanejs/adapter-cloudflare`

Deploy an Octane full-stack build to Cloudflare Workers with Workers Static
Assets. The adapter keeps the existing `dist/client` and `dist/server` layout
and adds a module Worker entry at `dist/server/worker.js`.

```bash
pnpm add @octanejs/adapter-cloudflare
pnpm add -D wrangler
```

## Configure Octane

```ts
import { cloudflare } from '@octanejs/adapter-cloudflare';
import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';

export default defineConfig({
	adapter: cloudflare(),
	router: {
		routes: [new RenderRoute({ path: '/*path', entry: '/src/App.tsrx' })],
	},
});
```

The same adapter contract is supported by `@octanejs/rsbuild-plugin`.

## Configure Wrangler

Keep `wrangler.jsonc` in your app as the source of truth so bindings, routes,
secrets, environments, placement, and observability remain under your control:

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"name": "my-octane-app",
	"main": "./dist/server/worker.js",
	"compatibility_date": "2026-07-14",
	"compatibility_flags": ["nodejs_compat"],
	"assets": {
		"directory": "./dist/client",
		"binding": "ASSETS",
	},
}
```

`nodejs_compat` is currently required for the synchronous SHA-256 and
`AsyncLocalStorage` primitives used by Octane server functions and request-local
fetch handling. Use a current compatibility date when creating a new app.

Build first, then run or deploy the exact production output:

```bash
pnpm vite build
pnpm wrangler dev
pnpm wrangler deploy
```

Cloudflare's default asset-first routing is the intended setup: exact files in
`dist/client` are served without invoking the Worker, and every miss reaches
Octane SSR. Leave `assets.not_found_handling` unset (the default `"none"`) or
set it explicitly to `"none"`: both `"single-page-application"` and
`"404-page"` can prevent browser-navigation misses from reaching SSR. Leave
`run_worker_first` unset/`false` unless every asset request intentionally needs
Worker logic.

The generated Worker forwards Cloudflare's request-scoped `{ env, ctx }` as
`context.platform` to middleware and `ServerRoute` handlers:

```ts
import type { CloudflarePlatform } from '@octanejs/adapter-cloudflare';

const platform = context.platform as CloudflarePlatform<Env>;
await platform.env.MY_KV.get('key');
platform.ctx.waitUntil(writeAnalytics());
```

Streaming SSR remains a Web `ReadableStream` from Octane through the Worker;
the adapter does not buffer or translate the response body.
