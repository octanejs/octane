const require_config = require("./config.cjs");
const require_router_plugin_context = require("./router-plugin-context.cjs");
const require_framework_plugin_order = require("./framework-plugin-order.cjs");
let _tanstack_router_generator = require("@tanstack/router-generator");
let node_path = require("node:path");
//#region src/core/router-generator-plugin.ts
var PLUGIN_NAME = "unplugin:router-generator";
function createRouterGeneratorPlugin(options = {}, routerPluginContext) {
	let ROOT = process.cwd();
	let userConfig;
	let generator;
	const routeGenerationDisabled = () => userConfig.enableRouteGeneration === false;
	const getRoutesDirectoryPath = () => {
		return (0, node_path.isAbsolute)(userConfig.routesDirectory) ? userConfig.routesDirectory : (0, node_path.join)(ROOT, userConfig.routesDirectory);
	};
	const initConfigAndGenerator = (opts) => {
		if (opts?.root) ROOT = opts.root;
		if (typeof options === "function") userConfig = options();
		else userConfig = require_config.getConfig(options, ROOT);
		generator = new _tanstack_router_generator.Generator({
			config: userConfig,
			root: ROOT
		});
	};
	const generate = async (opts) => {
		if (routeGenerationDisabled()) return;
		let generatorEvent = void 0;
		if (opts) {
			const filePath = (0, node_path.normalize)(opts.file);
			if (filePath === (0, _tanstack_router_generator.resolveConfigPath)({ configDirectory: ROOT })) {
				initConfigAndGenerator();
				return;
			}
			generatorEvent = {
				path: filePath,
				type: opts.event
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
		name: "tanstack:router-generator",
		enforce: "pre",
		async watchChange(id, { event }) {
			await generate({
				file: id,
				event
			});
		},
		vite: { async configResolved(config) {
			initConfigAndGenerator({ root: config.root });
			if (userConfig.target === "octane") require_framework_plugin_order.validateFrameworkPluginOrder({
				framework: userConfig.target,
				plugins: config.plugins,
				routerPluginName: "tanstack:router-generator"
			});
			await generate();
		} },
		rspack(compiler) {
			initConfigAndGenerator();
			let handle = null;
			compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, () => generate());
			compiler.hooks.watchRun.tapPromise(PLUGIN_NAME, async () => {
				if (handle) return;
				const routesDirectoryPath = getRoutesDirectoryPath();
				handle = (await import("chokidar")).watch(routesDirectoryPath, { ignoreInitial: true }).on("add", (file) => generate({
					file,
					event: "create"
				}));
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
				handle = (await import("chokidar")).watch(routesDirectoryPath, { ignoreInitial: true }).on("add", (file) => generate({
					file,
					event: "create"
				}));
				await generate();
			});
			compiler.hooks.watchClose.tap(PLUGIN_NAME, async () => {
				if (handle) await handle.close();
			});
			compiler.hooks.done.tap(PLUGIN_NAME, () => {
				console.info("✅ unplugin:router-generator: route-tree generation done");
			});
		},
		esbuild: { config() {
			initConfigAndGenerator();
		} }
	};
}
var unpluginRouterGeneratorFactory = (options = {}) => {
	return createRouterGeneratorPlugin(options, require_router_plugin_context.createRouterPluginContext());
};
//#endregion
exports.createRouterGeneratorPlugin = createRouterGeneratorPlugin;
exports.unpluginRouterGeneratorFactory = unpluginRouterGeneratorFactory;

//# sourceMappingURL=router-generator-plugin.cjs.map