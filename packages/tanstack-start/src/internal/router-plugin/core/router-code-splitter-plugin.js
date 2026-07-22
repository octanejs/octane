import { getConfig, splitGroupingsSchema } from './config.js';
import {
	defaultCodeSplitGroupings,
	splitRouteIdentNodes,
	tsrShared,
	tsrSplit,
} from './constants.js';
import { debug, normalizePath, routeFactoryCallCodeFilter } from './utils.js';
import {
	compileCodeSplitReferenceRoute,
	compileCodeSplitSharedRoute,
	compileCodeSplitVirtualRoute,
	computeSharedBindings,
	detectCodeSplitGroupingsFromRoute,
} from './code-splitter/compilers.js';
import {
	getReferenceRouteCompilerPlugins,
	getVirtualRouteCompilerPlugins,
} from './code-splitter/plugins/framework-plugins.js';
import { createRouterPluginContext } from './router-plugin-context.js';
import { validateFrameworkPluginOrder } from './framework-plugin-order.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeIdentifier, logDiff } from '@tanstack/router-utils';
//#region src/core/router-code-splitter-plugin.ts
/**
 * It is important to familiarize yourself with how the code-splitting works in this plugin.
 * https://github.com/TanStack/router/pull/3355
 */
var CODE_SPLITTER_PLUGIN_NAME = 'tanstack-router:code-splitter:compile-reference-file';
function createRouterCodeSplitterPlugin(options = {}, routerPluginContext) {
	let ROOT = process.cwd();
	let userConfig;
	function initUserConfig() {
		if (typeof options === 'function') userConfig = options();
		else userConfig = getConfig(options, ROOT);
	}
	let isProduction = process.env.NODE_ENV === 'production';
	const sharedBindingsMap = /* @__PURE__ */ new Map();
	const getGlobalCodeSplitGroupings = () => {
		return userConfig.codeSplittingOptions?.defaultBehavior || defaultCodeSplitGroupings;
	};
	const getShouldSplitFn = () => {
		return userConfig.codeSplittingOptions?.splitBehavior;
	};
	const shouldAddHmr = () => {
		return (userConfig.codeSplittingOptions?.addHmr ?? true) && !isProduction;
	};
	const handleCompilingReferenceFile = (code, id, generatorNodeInfo) => {
		if (debug) console.info('Compiling Route: ', id);
		const fromCode = detectCodeSplitGroupingsFromRoute({
			code,
			filename: id,
		});
		if (fromCode.groupings !== void 0) {
			const res = splitGroupingsSchema.safeParse(fromCode.groupings);
			if (!res.success) {
				const message = res.error.issues.map((e) => e.message).join('. ');
				throw new Error(`The groupings for the route "${id}" are invalid.\n${message}`);
			}
		}
		const pluginSplitBehavior = getShouldSplitFn()?.({ routeId: generatorNodeInfo.routeId });
		if (pluginSplitBehavior) {
			const res = splitGroupingsSchema.safeParse(pluginSplitBehavior);
			if (!res.success) {
				const message = res.error.issues.map((e) => e.message).join('. ');
				throw new Error(
					`The groupings returned when using \`splitBehavior\` for the route "${id}" are invalid.\n${message}`,
				);
			}
		}
		const splitGroupings =
			fromCode.groupings ?? pluginSplitBehavior ?? getGlobalCodeSplitGroupings();
		const sharedBindings = computeSharedBindings({
			code,
			filename: id,
			codeSplitGroupings: splitGroupings,
		});
		if (sharedBindings.size > 0) sharedBindingsMap.set(id, sharedBindings);
		else sharedBindingsMap.delete(id);
		const addHmr = shouldAddHmr();
		const hmrStyle = userConfig.plugin?.hmr?.style ?? 'vite';
		const compiledReferenceRoute = compileCodeSplitReferenceRoute({
			code,
			codeSplitGroupings: splitGroupings,
			targetFramework: userConfig.target,
			filename: id,
			id,
			deleteNodes: userConfig.codeSplittingOptions?.deleteNodes
				? new Set(userConfig.codeSplittingOptions.deleteNodes)
				: void 0,
			addHmr,
			hmrStyle,
			hmrRouteId: generatorNodeInfo.routeId,
			sharedBindings: sharedBindings.size > 0 ? sharedBindings : void 0,
			compilerPlugins: [
				...(getReferenceRouteCompilerPlugins({
					targetFramework: userConfig.target,
					addHmr,
					hmrStyle,
				}) ?? []),
				...(userConfig.codeSplittingOptions?.compilerPlugins ?? []),
			],
		});
		if (compiledReferenceRoute === null) {
			if (debug) console.info(`No changes made to route "${id}", skipping code-splitting.`);
			return null;
		}
		if (debug) {
			logDiff(code, compiledReferenceRoute.code);
			console.log('Output:\n', compiledReferenceRoute.code + '\n\n');
		}
		return compiledReferenceRoute;
	};
	const handleCompilingVirtualFile = (code, id) => {
		if (debug) console.info('Splitting Route: ', id);
		const [_, ...pathnameParts] = id.split('?');
		const splitValue = new URLSearchParams(pathnameParts.join('?')).get(tsrSplit);
		if (!splitValue)
			throw new Error(`The split value for the virtual route "${id}" was not found.`);
		const rawGrouping = decodeIdentifier(splitValue);
		const grouping = [...new Set(rawGrouping)].filter((p) => splitRouteIdentNodes.includes(p));
		const baseId = id.split('?')[0];
		const result = compileCodeSplitVirtualRoute({
			code,
			filename: id,
			splitTargets: grouping,
			sharedBindings: sharedBindingsMap.get(baseId),
			compilerPlugins: getVirtualRouteCompilerPlugins({
				targetFramework: userConfig.target,
				addHmr: shouldAddHmr(),
				hmrStyle: userConfig.plugin?.hmr?.style ?? 'vite',
			}),
		});
		if (debug) {
			logDiff(code, result.code);
			console.log('Output:\n', result.code + '\n\n');
		}
		return result;
	};
	return [
		{
			name: 'tanstack-router:code-splitter:compile-reference-file',
			enforce: 'pre',
			transform: {
				filter: {
					id: {
						exclude: [tsrSplit, tsrShared],
						include: [/\.(m|c)?(j|t)sx?$/, /\.tsrx(?:$|\?)/],
					},
					code: { include: routeFactoryCallCodeFilter },
				},
				handler(code, id) {
					const normalizedId = normalizePath(id);
					const generatorFileInfo = routerPluginContext.routesByFile.get(normalizedId);
					if (generatorFileInfo)
						return handleCompilingReferenceFile(code, normalizedId, generatorFileInfo);
					return null;
				},
			},
			vite: {
				configResolved(config) {
					isProduction = config.command === 'build';
					ROOT = config.root;
					initUserConfig();
					validateFrameworkPluginOrder({
						framework: userConfig.target,
						plugins: config.plugins,
						routerPluginName: CODE_SPLITTER_PLUGIN_NAME,
					});
				},
				applyToEnvironment(environment) {
					if (userConfig.plugin?.vite?.environmentName)
						return userConfig.plugin.vite.environmentName === environment.name;
					return true;
				},
			},
			rspack(compiler) {
				isProduction = compiler.options.mode === 'production';
				ROOT = process.cwd();
				initUserConfig();
			},
			webpack(compiler) {
				isProduction = compiler.options.mode === 'production';
				ROOT = process.cwd();
				initUserConfig();
			},
		},
		{
			name: 'tanstack-router:code-splitter:compile-virtual-file',
			enforce: 'pre',
			transform: {
				filter: { id: /tsr-split/ },
				handler(code, id) {
					const url = pathToFileURL(id);
					url.searchParams.delete('v');
					return handleCompilingVirtualFile(code, normalizePath(fileURLToPath(url)));
				},
			},
			vite: {
				applyToEnvironment(environment) {
					if (userConfig.plugin?.vite?.environmentName)
						return userConfig.plugin.vite.environmentName === environment.name;
					return true;
				},
			},
		},
		{
			name: 'tanstack-router:code-splitter:compile-shared-file',
			enforce: 'pre',
			transform: {
				filter: { id: /tsr-shared/ },
				handler(code, id) {
					const url = pathToFileURL(id);
					url.searchParams.delete('v');
					const normalizedId = normalizePath(fileURLToPath(url));
					const [baseId] = normalizedId.split('?');
					if (!baseId) return null;
					const sharedBindings = sharedBindingsMap.get(baseId);
					if (!sharedBindings || sharedBindings.size === 0) return null;
					if (debug) console.info('Compiling Shared Module: ', id);
					const result = compileCodeSplitSharedRoute({
						code,
						sharedBindings,
						filename: normalizedId,
					});
					if (debug) {
						logDiff(code, result.code);
						console.log('Output:\n', result.code + '\n\n');
					}
					return result;
				},
			},
			vite: {
				applyToEnvironment(environment) {
					if (userConfig.plugin?.vite?.environmentName)
						return userConfig.plugin.vite.environmentName === environment.name;
					return true;
				},
			},
		},
	];
}
var unpluginRouterCodeSplitterFactory = (options = {}) => {
	return createRouterCodeSplitterPlugin(options, createRouterPluginContext());
};
//#endregion
export { createRouterCodeSplitterPlugin, unpluginRouterCodeSplitterFactory };
