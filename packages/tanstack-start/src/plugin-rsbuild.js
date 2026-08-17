import { fileURLToPath } from 'node:url';
import {
	RSBUILD_ENVIRONMENT_NAMES,
	tanStackStartRsbuild,
} from '#tanstack-start/plugin-core/rsbuild';
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { octaneRouteGeneratorPlugin } from '@octanejs/tanstack-router/generator-plugin';
import { octaneStartDefaultEntryPaths } from './default-entry-paths.js';
import { validateOctaneCompilerOptions } from './validate-options.js';

const clientOnlyStripLoaderPath = fileURLToPath(
	new URL('./client-only-server-strip-loader.js', import.meta.url),
);

export function tanstackStart(options) {
	const { octane: octaneOptions, ...startOptions } = options ?? {};
	validateOctaneCompilerOptions(octaneOptions);

	const corePlugin = tanStackStartRsbuild(
		{
			framework: 'octane',
			defaultEntryPaths: octaneStartDefaultEntryPaths,
			providerEnvironmentName: RSBUILD_ENVIRONMENT_NAMES.server,
			ssrIsProvider: true,
			routerGeneratorPlugins: [octaneRouteGeneratorPlugin()],
		},
		startOptions,
	);

	return {
		name: 'octanejs-tanstack-start',
		enforce: 'pre',
		async setup(api) {
			const resolvedOctaneOptions = octaneOptions ? { ...octaneOptions } : {};
			if (resolvedOctaneOptions.profile === undefined && resolvedOctaneOptions.devtools === true) {
				resolvedOctaneOptions.profile = api.context.action !== 'build';
			}
			delete resolvedOctaneOptions.devtools;

			api.modifyRspackConfig((config, { environment }) => {
				const octaneEnvironment =
					environment.name === RSBUILD_ENVIRONMENT_NAMES.client ? 'client' : 'server';
				config.plugins ??= [];
				config.plugins.push(
					new OctaneRspackPlugin({
						...resolvedOctaneOptions,
						root: api.context.rootPath,
						environment: octaneEnvironment,
						transpile: false,
						...(resolvedOctaneOptions.profile === undefined
							? null
							: {
									profile: octaneEnvironment === 'client' && resolvedOctaneOptions.profile,
								}),
					}),
				);
				if (octaneEnvironment === 'server') {
					config.plugins.push({
						name: 'octanejs-tanstack-start:client-only-server-strip',
						apply(compiler) {
							compiler.options.module ??= {};
							compiler.options.module.rules ??= [];
							compiler.options.module.rules.push({
								test: /\.tsrx$/,
								enforce: 'pre',
								use: [{ loader: clientOnlyStripLoaderPath }],
							});
						},
					});
				}
				return config;
			});

			// Register Octane's transform before Start's route analysis and
			// environment transforms.
			await corePlugin.setup(api);
		},
	};
}
