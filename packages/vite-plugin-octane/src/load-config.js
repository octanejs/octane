// @ts-check

import fs from 'node:fs';

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
			moduleRunner: viteConfigModuleRunner(tempVite),
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
		moduleRunner: viteConfigModuleRunner(vite),
	};
}

/**
 * Adapt Vite's SSR runner and module graph to app-core's config-loader
 * contract. Config evaluation itself is not enough: integrations also need
 * the transitive file set so edits to imported renderer rules/boundary tables
 * invalidate the compiler snapshot.
 *
 * @param {import('vite').ViteDevServer} vite
 * @returns {import('@octanejs/app-core').ConfigModuleRunner}
 */
function viteConfigModuleRunner(vite) {
	return {
		loadModule: (/** @type {string} */ id) => vite.ssrLoadModule(id),
		getDependencies(id) {
			const graph = vite.environments.ssr.moduleGraph;
			const roots = new Set();
			const candidates = new Set([id]);
			try {
				// Vite canonicalizes graph IDs through realpath. Preserve the
				// config loader's lexical path in its own metadata, but use both
				// forms to find the root (notably /var -> /private/var on macOS).
				candidates.add(fs.realpathSync(id));
			} catch {
				// The config loader reports the useful missing-file error.
			}
			for (const candidate of candidates) {
				const byId = graph.getModuleById(candidate);
				if (byId) roots.add(byId);
				for (const module of graph.getModulesByFile(candidate) ?? []) roots.add(module);
			}

			const seen = new Set();
			const dependencies = new Set();
			/** @param {import('vite').EnvironmentModuleNode} module */
			function visit(module) {
				if (seen.has(module)) return;
				seen.add(module);
				if (module.file) dependencies.add(module.file);
				for (const imported of module.importedModules) visit(imported);
			}
			for (const root of roots) visit(root);
			return [...dependencies];
		},
	};
}
