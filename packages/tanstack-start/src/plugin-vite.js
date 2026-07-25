import { START_ENVIRONMENT_NAMES, tanStackStartVite } from '#tanstack-start/plugin-core/vite';
import { octaneRouteGeneratorPlugin } from '@octanejs/tanstack-router/generator-plugin';
import { octane } from 'octane/compiler/vite';
import { octaneClientOnlyServerStrip } from './client-only-server-strip.js';
import { octaneStartDefaultEntryPaths } from './default-entry-paths.js';
import { validateOctaneCompilerOptions } from './validate-options.js';

// The Start runtime chain must be source-served. Its compiler removes
// environment-specific branches; a prebundled dependency bypasses that
// transform and can execute server-only storage code in the browser.
const WORKSPACE_SOURCE_EXCLUDES = [
	'@octanejs/tanstack-start',
	'@octanejs/tanstack-router',
	'@tanstack/start-client-core',
	'@tanstack/start-storage-context',
	'@tanstack/start-fn-stubs',
	'@tanstack/start-static-server-functions',
	'octane',
];

// The router ships raw TSRX, so its registry subpath imports surface after
// initial dependency discovery. Predeclare them to prevent a mid-hydration
// optimized-dependency reload on a cold cache.
const WORKSPACE_SOURCE_INCLUDES = [
	'@octanejs/tanstack-router > @tanstack/router-core/isServer',
	'@octanejs/tanstack-router > @tanstack/router-core/scroll-restoration-script',
	'@octanejs/tanstack-start > @tanstack/router-core/isServer',
];

export function tanstackStart(options) {
	const { octane: octaneOptions, ...startOptions } = options ?? {};
	validateOctaneCompilerOptions(octaneOptions);

	// `devtools: true` is Start's shorthand for the compiler's command-aware
	// profiling signal (mirrors `@octanejs/vite-plugin`'s `devtools` option): an
	// explicit `profile` always wins, otherwise `devtools` maps to `'auto'`
	// (profiling on in `vite dev`, compiled out of `vite build`). `octane()`
	// itself only understands `profile`, so this is resolved before the plugin
	// is created and the `devtools` key never reaches it.
	const resolvedOctaneOptions = octaneOptions ? { ...octaneOptions } : octaneOptions;
	if (resolvedOctaneOptions) {
		if (resolvedOctaneOptions.profile === undefined && resolvedOctaneOptions.devtools === true) {
			resolvedOctaneOptions.profile = 'auto';
		}
		delete resolvedOctaneOptions.devtools;
	}

	const corePluginOptions = {
		framework: 'octane',
		defaultEntryPaths: octaneStartDefaultEntryPaths,
		providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
		ssrIsProvider: true,
		ssrResolverStrategy: { type: 'default' },
		routerGeneratorPlugins: [octaneRouteGeneratorPlugin()],
	};

	return [
		// Must run before the octane compiler: strips <ClientOnly> children on
		// the server (the octane analogue of start-compiler handleClientOnlyJSX).
		octaneClientOnlyServerStrip(),
		octane(resolvedOctaneOptions),
		{
			name: 'octanejs-tanstack-start:workspace-source-deps',
			configEnvironment(environmentName, environmentOptions) {
				const applies =
					environmentName === START_ENVIRONMENT_NAMES.client ||
					(environmentName === START_ENVIRONMENT_NAMES.server &&
						environmentOptions.optimizeDeps?.noDiscovery === false);
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
		tanStackStartVite(corePluginOptions, startOptions),
	];
}
