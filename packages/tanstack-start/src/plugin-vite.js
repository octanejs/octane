import { tanstackStart as vendoredTanstackStart } from '@tanstack/octane-start/plugin/vite';

export * from '@tanstack/octane-start/plugin/vite';

// The Start runtime chain must be SOURCE-served, never prebundled: the start
// compiler strips server-only branches (createIsomorphicFn / createServerFn)
// per environment, and prebundled dep chunks bypass plugin transforms — a
// prebundle executes @tanstack/start-storage-context's server-only
// `new AsyncLocalStorage()` in the browser. The vendored plugin already
// excludes @tanstack/octane-start + @tanstack/octane-router; while those were
// node_modules installs their nested deps were implicitly source-served too,
// but as vendored workspace links (vendor/) imports crossing into the
// registry-installed start-* core packages become eligible for runtime dep
// discovery, so the binding excludes them for every consumer.
const WORKSPACE_SOURCE_EXCLUDES = [
	'@tanstack/octane-start-client',
	'@tanstack/start-client-core',
	'@tanstack/start-storage-context',
	'@tanstack/start-fn-stubs',
];

// The vendored octane-router is raw source (vite's scanner cannot parse
// .tsrx), so its registry-dep subpath imports surface only at request time.
// Any of them discovered AFTER the initial optimize pass triggers vite's
// "optimized dependencies changed" full page reload mid-session — under a
// hydrating page that reload races hydration. Pre-declare every registry
// subpath the octane-router client surface reaches.
const WORKSPACE_SOURCE_INCLUDES = [
	'@tanstack/octane-router > @tanstack/router-core/isServer',
	'@tanstack/octane-router > @tanstack/router-core/scroll-restoration-script',
];

export function tanstackStart(options) {
	return [
		vendoredTanstackStart(options),
		{
			name: 'octanejs-tanstack-start:workspace-source-deps',
			configEnvironment(environmentName, environmentOptions) {
				// Mirror the vendored plugin's own exclude condition: the client
				// environment always optimizes; the server environment only when
				// discovery is explicitly enabled.
				const applies =
					environmentName === 'client' ||
					(environmentName === 'ssr' && environmentOptions.optimizeDeps?.noDiscovery === false);
				return applies
					? {
							optimizeDeps: {
								exclude: WORKSPACE_SOURCE_EXCLUDES,
								include: WORKSPACE_SOURCE_INCLUDES,
							},
						}
					: undefined;
			},
		},
	];
}
