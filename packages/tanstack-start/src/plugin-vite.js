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

export function tanstackStart(options) {
	return [
		vendoredTanstackStart(options),
		{
			name: 'octanejs-tanstack-start:workspace-source-excludes',
			configEnvironment(environmentName, environmentOptions) {
				// Mirror the vendored plugin's own exclude condition: the client
				// environment always optimizes; the server environment only when
				// discovery is explicitly enabled.
				const applies =
					environmentName === 'client' ||
					(environmentName === 'ssr' && environmentOptions.optimizeDeps?.noDiscovery === false);
				return applies ? { optimizeDeps: { exclude: WORKSPACE_SOURCE_EXCLUDES } } : undefined;
			},
		},
	];
}
