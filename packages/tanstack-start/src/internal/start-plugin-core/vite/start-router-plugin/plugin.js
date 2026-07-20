import { VITE_ENVIRONMENT_NAMES } from '../../constants.js';
import { routesManifestPlugin } from '../../start-router-plugin/generator-plugins/routes-manifest-plugin.js';
import { prerenderRoutesPlugin } from '../../start-router-plugin/generator-plugins/prerender-routes-plugin.js';
import { composeGeneratorPlugins } from '../../start-router-plugin/generator-plugins/compose-generator-plugins.js';
import { buildRouteTreeFileFooterFromConfig } from '../../start-router-plugin/route-tree-footer.js';
import '../../start-router-plugin/constants.js';
import { pruneServerOnlySubtrees } from '../../start-router-plugin/pruneServerOnlySubtrees.js';
import path from 'pathe';
import { normalizePath } from 'vite';
import { createRouterPluginContext } from '#tanstack-start/router-plugin/context';
import {
	tanStackRouterCodeSplitter,
	tanstackRouterGenerator,
} from '#tanstack-start/router-plugin/vite';
//#region src/vite/start-router-plugin/plugin.ts
function isServerOnlyNode(node) {
	if (!node?.createFileRouteProps) return false;
	return node.createFileRouteProps.has('server') && node.createFileRouteProps.size === 1;
}
function tanStackStartRouter(startPluginOpts, getConfig, corePluginOpts) {
	const routerPluginContext = createRouterPluginContext();
	const getGeneratedRouteTreePath = () => {
		const { startConfig } = getConfig();
		return path.resolve(startConfig.router.generatedRouteTree);
	};
	let clientEnvironment = null;
	function invalidate() {
		if (!clientEnvironment) return;
		const mod = clientEnvironment.moduleGraph.getModuleById(getGeneratedRouteTreePath());
		if (mod) clientEnvironment.moduleGraph.invalidateModule(mod);
		clientEnvironment.hot.send({
			type: 'full-reload',
			path: '*',
		});
	}
	let generatorInstance = null;
	const clientTreeGeneratorPlugin = {
		name: 'start-client-tree-plugin',
		init({ generator }) {
			generatorInstance = generator;
		},
		afterTransform({ node, prevNode }) {
			if (isServerOnlyNode(node) !== isServerOnlyNode(prevNode)) invalidate();
		},
	};
	let routeTreeFileFooter = null;
	function getRouteTreeFileFooter() {
		if (routeTreeFileFooter) return routeTreeFileFooter;
		routeTreeFileFooter = [
			...buildRouteTreeFileFooterFromConfig({
				generatedRouteTreePath: getGeneratedRouteTreePath(),
				getConfig,
				corePluginOpts,
			}),
		];
		return routeTreeFileFooter;
	}
	let resolvedGeneratedRouteTreePath = null;
	const clientTreePlugin = {
		name: 'tanstack-start:route-tree-client-plugin',
		enforce: 'pre',
		applyToEnvironment: (env) => env.name === VITE_ENVIRONMENT_NAMES.client,
		configureServer(server) {
			clientEnvironment = server.environments[VITE_ENVIRONMENT_NAMES.client];
		},
		config() {
			resolvedGeneratedRouteTreePath = normalizePath(getGeneratedRouteTreePath());
			clientTreePlugin.load.filter = {
				id: { include: new RegExp(resolvedGeneratedRouteTreePath) },
			};
		},
		load: {
			filter: {},
			async handler() {
				if (!generatorInstance) throw new Error('Generator instance not initialized');
				const crawlingResult = await generatorInstance.getCrawlingResult();
				if (!crawlingResult) throw new Error('Crawling result not available');
				const prunedAcc = pruneServerOnlySubtrees(crawlingResult);
				const acc = {
					...crawlingResult.acc,
					...prunedAcc,
				};
				return {
					code: generatorInstance.buildRouteTree({
						...crawlingResult,
						acc,
						config: {
							disableTypes: true,
							enableRouteTreeFormatting: false,
							routeTreeFileHeader: [],
							routeTreeFileFooter: [],
						},
					}).routeTreeContent,
					map: null,
				};
			},
		},
	};
	return [
		clientTreePlugin,
		tanstackRouterGenerator(() => {
			const routerConfig = getConfig().startConfig.router;
			const builtInPlugins = [clientTreeGeneratorPlugin, routesManifestPlugin()];
			if (startPluginOpts.prerender?.enabled === true) builtInPlugins.push(prerenderRoutesPlugin());
			const plugins = composeGeneratorPlugins({
				frameworkPlugins: corePluginOpts.routerGeneratorPlugins,
				userPlugins: routerConfig.plugins,
				builtInPlugins,
			});
			return {
				...routerConfig,
				target: corePluginOpts.framework,
				routeTreeFileFooter: getRouteTreeFileFooter,
				plugins,
			};
		}, routerPluginContext),
		tanStackRouterCodeSplitter(() => {
			const routerConfig = getConfig().startConfig.router;
			return {
				...routerConfig,
				codeSplittingOptions: {
					...routerConfig.codeSplittingOptions,
					deleteNodes: ['ssr', 'server', 'headers'],
					addHmr: true,
				},
				plugin: { vite: { environmentName: VITE_ENVIRONMENT_NAMES.client } },
			};
		}, routerPluginContext),
		tanStackRouterCodeSplitter(() => {
			const routerConfig = getConfig().startConfig.router;
			return {
				...routerConfig,
				codeSplittingOptions: {
					...routerConfig.codeSplittingOptions,
					addHmr: false,
				},
				plugin: { vite: { environmentName: VITE_ENVIRONMENT_NAMES.server } },
			};
		}, routerPluginContext),
	];
}
//#endregion
export { tanStackStartRouter };
