// @ts-check

import {
	getOctaneConfigPath,
	loadOctaneConfig as loadCoreOctaneConfig,
	loadOctaneConfigWithMetadata as loadCoreOctaneConfigWithMetadata,
	octaneConfigExists,
	resolveOctaneConfig,
} from '@octanejs/app-core/config-loader';
import { compile } from 'octane/compiler';

export { getOctaneConfigPath, octaneConfigExists, resolveOctaneConfig };

/**
 * Vite compatibility facade over app-core's bundler-neutral config loader.
 * A live dev server is adapted to the neutral module-runner contract. Build
 * and preview calls use a temporary Vite module runner so lazy config imports
 * keep Vite's transform semantics without making app-core depend on Vite.
 *
 * @param {string} projectRoot
 * @param {{
 *   vite?: import('vite').ViteDevServer,
 *   moduleRunner?: import('@octanejs/app-core').ConfigModuleRunner | import('@octanejs/app-core').ConfigModuleRunner['loadModule'],
 *   requireAdapter?: boolean,
 *   configFile?: string,
 *   cacheDir?: string,
 * }} [options]
 */
export async function loadOctaneConfig(projectRoot, options = {}) {
	return withDefaultViteRunner(projectRoot, options, loadCoreOctaneConfig);
}

/**
 * @param {string} projectRoot
 * @param {{
 *   vite?: import('vite').ViteDevServer,
 *   moduleRunner?: import('@octanejs/app-core').ConfigModuleRunner | import('@octanejs/app-core').ConfigModuleRunner['loadModule'],
 *   requireAdapter?: boolean,
 *   configFile?: string,
 *   cacheDir?: string,
 * }} [options]
 */
export async function loadOctaneConfigWithMetadata(projectRoot, options = {}) {
	return withDefaultViteRunner(projectRoot, options, loadCoreOctaneConfigWithMetadata);
}

/**
 * @template T
 * @param {string} projectRoot
 * @param {Record<string, any>} options
 * @param {(root: string, options: any) => Promise<T>} loader
 * @returns {Promise<T>}
 */
async function withDefaultViteRunner(projectRoot, options, loader) {
	if (options.vite || options.moduleRunner) {
		return loader(projectRoot, withViteModuleRunner(options));
	}

	const { createServer } = await import('vite');
	const tempVite = await createServer({
		root: projectRoot,
		configFile: false,
		appType: 'custom',
		server: { middlewareMode: true },
		plugins: [
			{
				name: 'octane-config-tsrx-loader',
				transform(source, id) {
					const file = id.split('?')[0];
					if (!file.endsWith('.tsrx')) return null;
					return compile(source, file, { mode: 'server', hmr: false });
				},
			},
		],
		logLevel: 'silent',
	});

	try {
		return await loader(projectRoot, {
			...options,
			moduleRunner: {
				loadModule: (/** @type {string} */ id) => tempVite.ssrLoadModule(id),
			},
		});
	} finally {
		await tempVite.close();
	}
}

/** @param {Record<string, any>} options */
function withViteModuleRunner(options) {
	if (!options.vite || options.moduleRunner) return options;
	const { vite, ...rest } = options;
	return {
		...rest,
		moduleRunner: {
			loadModule: (/** @type {string} */ id) => vite.ssrLoadModule(id),
		},
	};
}
