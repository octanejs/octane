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
`web` hydration environment and a `node` SSR environment. A deployment adapter
with `serverTarget: 'webworker'` changes only the production server target to
`web-worker`; development SSR remains Node-based. Override the environment
names with `clientEnvironment` and `serverEnvironment` when composing a larger
Rsbuild setup.

```sh
pnpm rsbuild dev
pnpm rsbuild build
pnpm octane-rsbuild-preview
```

Production assets are written to `dist/client`; the self-contained ESM server,
SSR template, and route asset map are written to `dist/server`. Change the
shared root with `build.outDir` in `octane.config.ts`. The default generated
server exports `handler` and `nodeHandler` and auto-boots under Node. A
webworker adapter instead receives an importable `createWebWorkerHandler`
factory for its platform wrapper. The configured adapter runs after both
environments finish.

`build.target` applies to both application transforms and Rspack's generated
runtime. Use one ES level (`es2018`, `es2022`, and so on), `modules`, `false`, or
browser targets such as `['chrome100', 'firefox100', 'samsung24']`. Samsung
targets use the Samsung Internet version, not its Chromium engine version; for
example, `samsung24` corresponds to Chromium 117. The `modules` baseline also
includes Samsung Internet 14, which corresponds to Chromium 87. ES levels and
browser targets cannot be mixed in the same array. Transpilation changes syntax;
applications remain responsible for any additional Web API polyfills they use.

Common compiler options:

- `hmr` controls browser component handoff;
- `parallel` controls compiler workers; the default uses up to four, `false`
  compiles on the main thread, and `{ maxWorkers: 2 }` requests a custom limit;
- `profile` enables component profiling in the browser environment;
- `strong` overrides the app's `compiler.strong` setting;
- `exclude` skips path fragments in the plain `.ts`/`.js` hook-slot pass; and
- `clientEnvironment` / `serverEnvironment` rename the generated environments.

Rspack shares one loader worker pool per process, so the first parallel loader
determines its effective size. Worker startup has a fixed cost, so very small
builds may be faster with `parallel: false`.

The experimental `cssModuleConstants` option forwards the Rspack class plugin's
immutable CSS-export contract to both build environments. Use
`pluginOctane({ cssModuleConstants: true })` with
`output.cssModules.namedExport: true` and named or namespace CSS imports to fold
proven strings from Rsbuild's CSS-loader pipeline. Mutable default maps require
an explicit immutable-provider callback. This is disabled by default, adds a
bounded extra compile for eligible consumers, and leaves native `css/module`,
development, HMR, and watch output unchanged. See
[CSS-module constants](../../docs/compiler-css-module-constants.md).

Enable Strong mode for the whole app in `octane.config.ts`:

```ts
export default defineConfig({
	compiler: { strong: true },
});
```

You can also pass `pluginOctane({ strong: true })`. The plugin option takes
priority over the app config. Strong mode opts application code into immutable
render snapshots and pure render projections. The compiler rejects detectable
state, ref, Effect Event, snapshot-mutation, and nondeterministic-render
violations; production client builds condition memoization on the author's
assertion that every user-authored render operation is pure for its witnessed
inputs. Callee shape and `use*` spelling do not disable that optimization.

Dependencies retain compatibility behavior unless they begin a module with
`"use strong"`. Strong analysis is bounded: an unknown call is assumed pure, so
imported live accessors do not become immutable merely because their caller opts
in. Keep such consumers in compatibility mode or pass an actual snapshot.

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
