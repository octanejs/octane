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
- compiles local and linked/raw dependency sources in parallel Rspack workers;
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

Octane uses up to four Rspack loader workers by default. Set `parallel: false`
to compile on the main thread, or provide `parallel: { maxWorkers: 2 }` to
request a different worker-pool limit. Rspack shares one loader worker pool
per process, so the first parallel loader determines its effective size.
Source maps, module layers, compiler metadata, and watched package manifests
are preserved in both modes. Worker startup has a fixed cost, so very small
builds may be faster with `parallel: false`.

Set `strong: true` to opt application code into Strong mode's immutable
render-snapshot and pure-render contract. The compiler rejects detectable state,
ref, Effect Event, snapshot-mutation, and nondeterministic-render violations;
production client builds condition memoization on the author's assertion that
every user-authored render operation is pure for its witnessed inputs. Callee
shape and `use*` spelling do not disable that optimization:

```js
new OctaneRspackPlugin({ strong: true });
```

Dependencies keep their existing compatibility behavior. Any module can opt in
on its own by putting `"use strong"` before its imports. Strong analysis is
bounded: unknown calls are assumed pure, so live accessors must remain in a
compatibility-mode consumer or receive an actual snapshot.

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

Renderer options remain serializable data—there are no renderer callbacks—so the same
configuration is safe to reuse across compiler environments and caches.

For one-shot production builds, the experimental class-plugin option
`cssModuleConstants: true` folds proven named-string exports from JavaScript
CSS-module providers such as `css-loader` with CSS extraction. An immutable CSS
provider can instead supply a `cssModuleConstants(module)` callback. It runs on
the main thread and its facts are checked against the exact completed loader
source. Ordinary mutable default maps and native `css/module` are left alone.
Eligible consumers are compiled once more and are not stored in the persistent
module cache; other modules keep normal caching. The option is disabled by
default and does not change development, HMR, or watch output. See
[CSS-module constants](../../docs/compiler-css-module-constants.md) for the
provider contract and stylesheet-ownership rules.

Rspack layers can compile the same authored module against distinct universal
renderer graphs. Configure the background graph at the top level, then key
`layerSpecializations` by the exact value of `module.layer`:

```js
new OctaneRspackPlugin({
	runtime: '@fixture/native-background-runtime',
	renderers: backgroundRenderers,
	universalRuntime: { runtime: 'native', thread: 'background' },
	layerSpecializations: {
		'native:main': {
			runtime: '@fixture/native-main-runtime',
			renderers: mainThreadRenderers,
			universalRuntime: { runtime: 'native', thread: 'main-thread' },
		},
	},
});
```

The compiler selects `renderers` and `universalRuntime` from each transformed
module's layer. The plugin also installs `runtime` as an exact `octane` alias
for requests whose issuer belongs to that layer. Unconfigured and unknown
layers keep the top-level options. All renderer configurations participate in
source-dependency discovery and watching, and their normalized signatures and
runtime identities salt Rspack's persistent cache. The standalone loader
supports layer-specific compiler options but cannot install runtime aliases,
so `runtime` specializations require `OctaneRspackPlugin`.

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
