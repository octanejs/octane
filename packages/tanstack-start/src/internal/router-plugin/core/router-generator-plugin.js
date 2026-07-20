import { getConfig as getConfig$1 } from './config.js';
import { createRouterPluginContext } from './router-plugin-context.js';
import { validateFrameworkPluginOrder } from './framework-plugin-order.js';
import { Generator, resolveConfigPath } from '#tanstack-start/router-generator';
import { isAbsolute, join, normalize } from 'node:path';
//#region src/core/router-generator-plugin.ts
var PLUGIN_NAME = 'unplugin:router-generator';
function createRouterGeneratorPlugin(options = {}, routerPluginContext) {
	let ROOT = process.cwd();
	let userConfig;
	let generator;
	const routeGenerationDisabled = () => userConfig.enableRouteGeneration === false;
	const getRoutesDirectoryPath = () => {
		return isAbsolute(userConfig.routesDirectory)
			? userConfig.routesDirectory
			: join(ROOT, userConfig.routesDirectory);
	};
	const initConfigAndGenerator = (opts) => {
		if (opts?.root) ROOT = opts.root;
		if (typeof options === 'function') userConfig = options();
		else userConfig = getConfig$1(options, ROOT);
		generator = new Generator({
			config: userConfig,
			root: ROOT,
		});
	};
	const generate = async (opts) => {
		if (routeGenerationDisabled()) return;
		let generatorEvent = void 0;
		if (opts) {
			const filePath = normalize(opts.file);
			if (filePath === resolveConfigPath({ configDirectory: ROOT })) {
				initConfigAndGenerator();
				return;
			}
			generatorEvent = {
				path: filePath,
				type: opts.event,
			};
		}
		try {
			await generator.run(generatorEvent);
			routerPluginContext.routesByFile = generator.getRoutesByFileMap();
		} catch (e) {
			console.error(e);
		}
	};
	return {
		name: 'tanstack:router-generator',
		enforce: 'pre',
		async watchChange(id, { event }) {
			await generate({
				file: id,
				event,
			});
		},
		vite: {
			async configResolved(config) {
				initConfigAndGenerator({ root: config.root });
				if (userConfig.target === 'octane')
					validateFrameworkPluginOrder({
						framework: userConfig.target,
						plugins: config.plugins,
						routerPluginName: 'tanstack:router-generator',
					});
				await generate();
			},
		},
		rspack(compiler) {
			initConfigAndGenerator();
			let handle = null;
			compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate());
			compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
				if (handle) return;
				const routesDirectoryPath = getRoutesDirectoryPath();
				handle = (await import('chokidar'))
					.watch(routesDirectoryPath, { ignoreInitial: true })
					.on('add', (file) =>
						generate({
							file,
							event: 'create',
						}),
					);
				await generate();
			});
			compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
				if (handle) await handle.close();
			});
		},
		webpack(compiler) {
			initConfigAndGenerator();
			let handle = null;
			compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate());
			compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
				if (handle) return;
				const routesDirectoryPath = getRoutesDirectoryPath();
				handle = (await import('chokidar'))
					.watch(routesDirectoryPath, { ignoreInitial: true })
					.on('add', (file) =>
						generate({
							file,
							event: 'create',
						}),
					);
				await generate();
			});
			compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
				if (handle) await handle.close();
			});
			compiler.hooks.done.tap(PLUGIN_NAME, () => {
				console.info('✅ unplugin:router-generator: route-tree generation done');
			});
		},
		esbuild: {
			config() {
				initConfigAndGenerator();
			},
		},
	};
}
var unpluginRouterGeneratorFactory = (options = {}) => {
	return createRouterGeneratorPlugin(options, createRouterPluginContext());
};
//#endregion
export { createRouterGeneratorPlugin, unpluginRouterGeneratorFactory };
