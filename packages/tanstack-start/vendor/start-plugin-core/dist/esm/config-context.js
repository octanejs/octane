import { createNormalizedBasePaths, createNormalizedOutputDirectories, deriveRouterBasepath, resolveStartEntryPlan } from "./planning.js";
//#region src/config-context.ts
function createStartConfigContext(opts) {
	const resolvedStartConfig = {
		root: "",
		startFilePath: void 0,
		routerFilePath: "",
		srcDirectory: "",
		basePaths: {
			publicBase: "",
			assetBase: {
				dev: "",
				build: ""
			}
		},
		outputDirectories: {
			client: "",
			server: ""
		}
	};
	let startConfig = null;
	let resolvedEntryPlanCache;
	function requireRoot() {
		if (!resolvedStartConfig.root) throw new Error(`Cannot get config before root is resolved`);
		return resolvedStartConfig.root;
	}
	function getStartConfig() {
		if (!startConfig) startConfig = opts.parseConfig(opts.startPluginOpts, { framework: opts.corePluginOpts.framework }, requireRoot());
		return startConfig;
	}
	function getResolvedEntryPlan() {
		if (resolvedEntryPlanCache) return resolvedEntryPlanCache;
		resolvedEntryPlanCache = resolveStartEntryPlan({
			root: requireRoot(),
			startConfig: getStartConfig(),
			defaultEntryPaths: opts.corePluginOpts.defaultEntryPaths
		});
		Object.assign(resolvedStartConfig, {
			srcDirectory: resolvedEntryPlanCache.srcDirectory,
			startFilePath: resolvedEntryPlanCache.startFilePath,
			routerFilePath: resolvedEntryPlanCache.routerFilePath
		});
		return resolvedEntryPlanCache;
	}
	const getConfig = () => {
		const startConfig = getStartConfig();
		getResolvedEntryPlan();
		return {
			startConfig,
			resolvedStartConfig
		};
	};
	function resolveEntries() {
		return getResolvedEntryPlan();
	}
	return {
		resolvedStartConfig,
		getConfig,
		resolveEntries
	};
}
function applyResolvedBaseAndOutput(opts) {
	opts.resolvedStartConfig.root = opts.root;
	opts.resolvedStartConfig.basePaths = createNormalizedBasePaths({ publicBase: opts.publicBase });
	opts.resolvedStartConfig.outputDirectories = createNormalizedOutputDirectories({
		client: opts.clientOutputDirectory,
		server: opts.serverOutputDirectory
	});
}
function applyResolvedRouterBasepath(opts) {
	const routerBasepath = deriveRouterBasepath({
		configuredBasepath: opts.startConfig.router.basepath,
		publicBase: opts.resolvedStartConfig.basePaths.publicBase
	});
	opts.startConfig.router.basepath = routerBasepath;
	return routerBasepath;
}
//#endregion
export { applyResolvedBaseAndOutput, applyResolvedRouterBasepath, createStartConfigContext };

//# sourceMappingURL=config-context.js.map