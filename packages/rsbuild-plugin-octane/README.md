# `@octanejs/rsbuild-plugin`

Full Octane app integration for Rsbuild 2.x: Rspack source compilation,
routing, streaming dev SSR, hydration, `module server` RPC, production
client/server environments, preview, and deployment adapters.

## Install

```sh
pnpm add octane @octanejs/rsbuild-plugin
pnpm add -D @rsbuild/core
```

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginOctane } from '@octanejs/rsbuild-plugin';

export default defineConfig({
	plugins: [pluginOctane()],
});
```

Without an `octane.config.ts` containing routes, the plugin only installs the
Octane compiler and preserves your own Rsbuild entries. Use the lower-level
`@octanejs/rspack-plugin` directly when you do not want Rsbuild.

## Routing and SSR

```ts
// octane.config.ts
import { defineConfig, RenderRoute, ServerRoute } from '@octanejs/rsbuild-plugin';

export default defineConfig({
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: '/src/Home.tsrx' }),
			new ServerRoute({
				path: '/api/health',
				handler: () => Response.json({ ok: true }),
			}),
		],
	},
});
```

`index.html` must contain `<!--ssr-head-->` in `<head>` and
`<!--ssr-body-->` inside `<div id="root">`. In app mode the plugin creates a
`web` hydration environment and a `node` SSR environment. Override their names
with `clientEnvironment` and `serverEnvironment` when composing a larger
Rsbuild setup.

```sh
pnpm rsbuild dev
pnpm rsbuild build
pnpm octane-rsbuild-preview
```

Production assets are written to `dist/client`; the self-contained ESM server,
SSR template, and route asset map are written to `dist/server`. Change the
shared root with `build.outDir` in `octane.config.ts`. The generated server
exports `handler` and `nodeHandler`, auto-boots under Node, and invokes a
configured adapter after both environments finish.

`build.target` applies to both application transforms and Rspack's generated
runtime. Use one ES level (`es2018`, `es2022`, and so on), `modules`, `false`, or
esbuild-style browser targets such as `['chrome100', 'firefox100']`. ES levels
and browser targets cannot be mixed in the same array.

Options are declarative and cache-stable:

- `hmr` controls browser component handoff;
- `profile` enables component profiling in the browser environment;
- `parallelUse` controls the compiler's parallel `use()` transform;
- `autoMemo` controls compiler-inferred component/calculation-region memoization in production;
- `exclude` skips path fragments in the plain `.ts`/`.js` hook-slot pass; and
- `clientEnvironment` / `serverEnvironment` rename the generated environments.

App mode currently serves from the root path and uses Rsbuild's default asset
prefix. Keep `server.base` at `/` and `output.assetPrefix` at `auto` or `/`; for
a subpath deployment, rewrite that prefix to the app root in the hosting proxy.
When `octane.config.ts` or one of its imported helpers changes, `rsbuild dev`
restarts the dev server and applies the complete config atomically. This is
required for `compiler.renderers`, because renderer selection is part of each
Rspack compiler's cache and loader identity. Source-module edits continue to
use the normal HMR or browser-reload path.

The package forwards normalized `compiler.renderers` registry, filename-rule,
and renderer-boundary metadata through the same Rspack compiler path used by
Vite and direct compilation. This enables the experimental universal client
target; a concrete Lynx runtime and cross-thread transport remain future work.
