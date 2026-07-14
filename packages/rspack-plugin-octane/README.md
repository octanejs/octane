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
Options contain only serializable strings, booleans, and string arrays, so the
same configuration is safe to reuse across compiler environments and caches.

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
and the exact server runtime alias yourself. The class plugin is recommended
unless another integration owns those concerns.

## App-level metadata

Transformed Rspack modules receive a serializable `buildInfo.octane` record
containing `canonicalId`, `transformKind`, and `serverRpc`. App integrations can
read the validated value with `getOctaneRspackBuildInfo(module)` without
depending on compiler output parsing for module identity.
