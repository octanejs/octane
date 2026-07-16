# `@octanejs/rspack-plugin`

Low-level Rspack 2.x integration for Octane. It compiles `.tsrx`, eligible
Octane `.tsx`, and raw `.ts`/`.js` hook sources; the full routing and SSR app
integration lives in `@octanejs/rsbuild-plugin`.

## Install

```sh
pnpm add octane
pnpm add -D @rspack/core @octanejs/rspack-plugin
```

## Rspack plugin

```js
// rspack.config.mjs
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';

export default {
	entry: './src/main.tsrx',
	plugins: [new OctaneRspackPlugin()],
};
```

The plugin:

- adds `.tsrx`, `.tsx`, and `.ts` resolution;
- installs the Octane pre-loader for local and linked/raw dependency sources;
- selects client or server codegen from Rspack's `target` (or an explicit
  `environment` option);
- resolves every exact bare `octane` import to one client runtime, or to
  `octane/server` in server compilations;
- forwards compiler source maps and registers consulted and missing manifests
  with Rspack's cache and watcher;
- emits the webpack/Rspack HMR dialect when the compilation is hot; and
- strips TypeScript with `builtin:swc-loader` after Octane by default.

Use an explicit environment for targets which do not identify their consumer:

```js
new OctaneRspackPlugin({ environment: 'server' });
```

Set `transpile: false` when an existing rule already strips TypeScript. Set
`hmr: false` to disable Octane HMR codegen even when Rspack HMR is active.
Set `profile: true` to produce a client profiling build; server compilations
always keep profiling disabled.
The experimental `renderers` option accepts the same declarative registry,
filename rules, and module/export boundary metadata as `compiler.renderers` in
Octane app config:

```js
new OctaneRspackPlugin({
	renderers: {
		registry: { three: '@octanejs/three/renderer' },
		boundaries: {
			'@octanejs/three': {
				Canvas: { ownerRenderer: 'dom', childRenderer: 'three', prop: 'children' },
			},
		},
		rules: [{ include: 'src/scenes/**/*.tsrx', renderer: 'three' }],
	},
});
```

Options remain serializable data—there are no renderer callbacks—so the same
configuration is safe to reuse across compiler environments and caches.

Rspack's dev server enables the loader's hot context. If you run a custom dev
server, add Rspack's `HotModuleReplacementPlugin` as usual.

## Loader only

The ESM loader is exported for custom rule composition:

```js
export default {
	module: {
		rules: [
			{
				test: /\.(?:tsrx|tsx|ts|js)$/,
				enforce: 'pre',
				type: 'javascript/auto',
				use: {
					loader: '@octanejs/rspack-plugin/loader',
					options: { environment: 'client' },
				},
			},
		],
	},
};
```

With the loader-only form, configure `.tsrx` resolution, TypeScript stripping,
and exact `octane$` / `octane/profiling$` aliases to the app's Octane package
yourself. The profiling alias keeps compiler metadata and runtime recording on
one module even when transformed raw dependencies carry a nested Octane copy.
You must also define Octane's
reserved profiling constant to the same boolean passed to the loader. Defining
`false` is important too: it lets production optimization erase the inactive
profiling runtime. The class plugin installs and owns this definition for you,
so do not configure it separately when using `OctaneRspackPlugin`.

```js
import { rspack } from '@rspack/core';

const profiling = process.env.OCTANE_PROFILE === '1';

export default {
	module: {
		rules: [
			{
				test: /\.(?:tsrx|tsx|ts|js)$/,
				enforce: 'pre',
				type: 'javascript/auto',
				use: {
					loader: '@octanejs/rspack-plugin/loader',
					options: { environment: 'client', profile: profiling },
				},
			},
		],
	},
	plugins: [
		new rspack.DefinePlugin({
			__OCTANE_PROFILE_ENABLED__: JSON.stringify(profiling),
		}),
	],
};
```

The class plugin is recommended unless another integration owns those concerns.

## App-level metadata

Transformed Rspack modules receive a serializable `buildInfo.octane` record
containing `canonicalId`, `transformKind`, and `serverRpc`. App integrations can
read the validated value with `getOctaneRspackBuildInfo(module)` without
depending on compiler output parsing for module identity.

When a renderer is declared `server: 'client-only'`, client compilations also
emit `octane-client-references.json`. Its stable reference IDs map each omitted
server module to the JavaScript chunks that contain its browser implementation;
server compilations retain the same ID on the export-preserving inert stub.
