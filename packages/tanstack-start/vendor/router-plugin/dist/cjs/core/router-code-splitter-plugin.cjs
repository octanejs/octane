const require_config = require("./config.cjs");
const require_constants = require("./constants.cjs");
const require_utils = require("./utils.cjs");
const require_compilers = require("./code-splitter/compilers.cjs");
const require_framework_plugins = require("./code-splitter/plugins/framework-plugins.cjs");
const require_router_plugin_context = require("./router-plugin-context.cjs");
const require_framework_plugin_order = require("./framework-plugin-order.cjs");
let node_url = require("node:url");
let _tanstack_router_utils = require("@tanstack/router-utils");
//#region src/core/router-code-splitter-plugin.ts
/**
* It is important to familiarize yourself with how the code-splitting works in this plugin.
* https://github.com/TanStack/router/pull/3355
*/
var CODE_SPLITTER_PLUGIN_NAME = "tanstack-router:code-splitter:compile-reference-file";
function createRouterCodeSplitterPlugin(options = {}, routerPluginContext) {
	let ROOT = process.cwd();
	let userConfig;
	function initUserConfig() {
		if (typeof options === "function") userConfig = options();
		else userConfig = require_config.getConfig(options, ROOT);
	}
	const isProduction = process.env.NODE_ENV === "production";
	const sharedBindingsMap = /* @__PURE__ */ new Map();
	const getGlobalCodeSplitGroupings = () => {
		return userConfig.codeSplittingOptions?.defaultBehavior || require_constants.defaultCodeSplitGroupings;
	};
	const getShouldSplitFn = () => {
		return userConfig.codeSplittingOptions?.splitBehavior;
	};
	const shouldAddHmr = () => {
		return (userConfig.codeSplittingOptions?.addHmr ?? true) && !isProduction;
	};
	const handleCompilingReferenceFile = (code, id, generatorNodeInfo) => {
		if (require_utils.debug) console.info("Compiling Route: ", id);
		const fromCode = require_compilers.detectCodeSplitGroupingsFromRoute({
			code,
			filename: id
		});
		if (fromCode.groupings !== void 0) {
			const res = require_config.splitGroupingsSchema.safeParse(fromCode.groupings);
			if (!res.success) {
				const message = res.error.issues.map((e) => e.message).join(". ");
				throw new Error(`The groupings for the route "${id}" are invalid.\n${message}`);
			}
		}
		const pluginSplitBehavior = getShouldSplitFn()?.({ routeId: generatorNodeInfo.routeId });
		if (pluginSplitBehavior) {
			const res = require_config.splitGroupingsSchema.safeParse(pluginSplitBehavior);
			if (!res.success) {
				const message = res.error.issues.map((e) => e.message).join(". ");
				throw new Error(`The groupings returned when using \`splitBehavior\` for the route "${id}" are invalid.\n${message}`);
			}
		}
		const splitGroupings = fromCode.groupings ?? pluginSplitBehavior ?? getGlobalCodeSplitGroupings();
		const sharedBindings = require_compilers.computeSharedBindings({
			code,
			filename: id,
			codeSplitGroupings: splitGroupings
		});
		if (sharedBindings.size > 0) sharedBindingsMap.set(id, sharedBindings);
		else sharedBindingsMap.delete(id);
		const addHmr = shouldAddHmr();
		const hmrStyle = userConfig.plugin?.hmr?.style ?? "vite";
		const compiledReferenceRoute = require_compilers.compileCodeSplitReferenceRoute({
			code,
			codeSplitGroupings: splitGroupings,
			targetFramework: userConfig.target,
			filename: id,
			id,
			deleteNodes: userConfig.codeSplittingOptions?.deleteNodes ? new Set(userConfig.codeSplittingOptions.deleteNodes) : void 0,
			addHmr,
			hmrStyle,
			hmrRouteId: generatorNodeInfo.routeId,
			sharedBindings: sharedBindings.size > 0 ? sharedBindings : void 0,
			compilerPlugins: [...require_framework_plugins.getReferenceRouteCompilerPlugins({
				targetFramework: userConfig.target,
				addHmr,
				hmrStyle
			}) ?? [], ...userConfig.codeSplittingOptions?.compilerPlugins ?? []]
		});
		if (compiledReferenceRoute === null) {
			if (require_utils.debug) console.info(`No changes made to route "${id}", skipping code-splitting.`);
			return null;
		}
		if (require_utils.debug) {
			(0, _tanstack_router_utils.logDiff)(code, compiledReferenceRoute.code);
			console.log("Output:\n", compiledReferenceRoute.code + "\n\n");
		}
		return compiledReferenceRoute;
	};
	const handleCompilingVirtualFile = (code, id) => {
		if (require_utils.debug) console.info("Splitting Route: ", id);
		const [_, ...pathnameParts] = id.split("?");
		const splitValue = new URLSearchParams(pathnameParts.join("?")).get(require_constants.tsrSplit);
		if (!splitValue) throw new Error(`The split value for the virtual route "${id}" was not found.`);
		const rawGrouping = (0, _tanstack_router_utils.decodeIdentifier)(splitValue);
		const grouping = [...new Set(rawGrouping)].filter((p) => require_constants.splitRouteIdentNodes.includes(p));
		const baseId = id.split("?")[0];
		const result = require_compilers.compileCodeSplitVirtualRoute({
			code,
			filename: id,
			splitTargets: grouping,
			sharedBindings: sharedBindingsMap.get(baseId),
			compilerPlugins: require_framework_plugins.getVirtualRouteCompilerPlugins({
				targetFramework: userConfig.target,
				addHmr: shouldAddHmr(),
				hmrStyle: userConfig.plugin?.hmr?.style ?? "vite"
			})
		});
		if (require_utils.debug) {
			(0, _tanstack_router_utils.logDiff)(code, result.code);
			console.log("Output:\n", result.code + "\n\n");
		}
		return result;
	};
	return [
		{
			name: "tanstack-router:code-splitter:compile-reference-file",
			enforce: "pre",
			transform: {
				filter: {
					id: {
						exclude: [require_constants.tsrSplit, require_constants.tsrShared],
						include: [/\.(m|c)?(j|t)sx?$/, /\.tsrx(?:$|\?)/]
					},
					code: { include: require_utils.routeFactoryCallCodeFilter }
				},
				handler(code, id) {
					const normalizedId = require_utils.normalizePath(id);
					const generatorFileInfo = routerPluginContext.routesByFile.get(normalizedId);
					if (generatorFileInfo) return handleCompilingReferenceFile(code, normalizedId, generatorFileInfo);
					return null;
				}
			},
			vite: {
				configResolved(config) {
					ROOT = config.root;
					initUserConfig();
					require_framework_plugin_order.validateFrameworkPluginOrder({
						framework: userConfig.target,
						plugins: config.plugins,
						routerPluginName: CODE_SPLITTER_PLUGIN_NAME
					});
				},
				applyToEnvironment(environment) {
					if (userConfig.plugin?.vite?.environmentName) return userConfig.plugin.vite.environmentName === environment.name;
					return true;
				}
			},
			rspack() {
				ROOT = process.cwd();
				initUserConfig();
			},
			webpack() {
				ROOT = process.cwd();
				initUserConfig();
			}
		},
		{
			name: "tanstack-router:code-splitter:compile-virtual-file",
			enforce: "pre",
			transform: {
				filter: { id: /tsr-split/ },
				handler(code, id) {
					const url = (0, node_url.pathToFileURL)(id);
					url.searchParams.delete("v");
					return handleCompilingVirtualFile(code, require_utils.normalizePath((0, node_url.fileURLToPath)(url)));
				}
			},
			vite: { applyToEnvironment(environment) {
				if (userConfig.plugin?.vite?.environmentName) return userConfig.plugin.vite.environmentName === environment.name;
				return true;
			} }
		},
		{
			name: "tanstack-router:code-splitter:compile-shared-file",
			enforce: "pre",
			transform: {
				filter: { id: /tsr-shared/ },
				handler(code, id) {
					const url = (0, node_url.pathToFileURL)(id);
					url.searchParams.delete("v");
					const normalizedId = require_utils.normalizePath((0, node_url.fileURLToPath)(url));
					const [baseId] = normalizedId.split("?");
					if (!baseId) return null;
					const sharedBindings = sharedBindingsMap.get(baseId);
					if (!sharedBindings || sharedBindings.size === 0) return null;
					if (require_utils.debug) console.info("Compiling Shared Module: ", id);
					const result = require_compilers.compileCodeSplitSharedRoute({
						code,
						sharedBindings,
						filename: normalizedId
					});
					if (require_utils.debug) {
						(0, _tanstack_router_utils.logDiff)(code, result.code);
						console.log("Output:\n", result.code + "\n\n");
					}
					return result;
				}
			},
			vite: { applyToEnvironment(environment) {
				if (userConfig.plugin?.vite?.environmentName) return userConfig.plugin.vite.environmentName === environment.name;
				return true;
			} }
		}
	];
}
var unpluginRouterCodeSplitterFactory = (options = {}) => {
	return createRouterCodeSplitterPlugin(options, require_router_plugin_context.createRouterPluginContext());
};
//#endregion
exports.createRouterCodeSplitterPlugin = createRouterCodeSplitterPlugin;
exports.unpluginRouterCodeSplitterFactory = unpluginRouterCodeSplitterFactory;

//# sourceMappingURL=router-code-splitter-plugin.cjs.map