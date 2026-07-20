import { getConfig } from './config.js';
import { createRouteHmrStatement } from './hmr/select-adapter.js';
import { debug, normalizePath, routeFactoryCallCodeFilter } from './utils.js';
import { compileCodeSplitReferenceRoute } from './code-splitter/compilers.js';
import { getReferenceRouteCompilerPlugins } from './code-splitter/plugins/framework-plugins.js';
import { validateFrameworkPluginOrder } from './framework-plugin-order.js';
import { generateFromAst, logDiff, parseAst } from '@tanstack/router-utils';
//#region src/core/router-hmr-plugin.ts
/**
 * This plugin adds HMR support for file routes.
 * It is only added to the composed plugin in dev when autoCodeSplitting is disabled, since the code splitting plugin
 * handles HMR for code-split routes itself.
 */
function createRouterHmrPlugin(options = {}, routerPluginContext) {
	let ROOT = process.cwd();
	const resolveUserConfig = () => {
		return getConfig(typeof options === 'function' ? options() : options, ROOT);
	};
	let userConfig = resolveUserConfig();
	return {
		name: 'tanstack-router:hmr',
		enforce: 'pre',
		transform: {
			filter: {
				id: [/\.(m|c)?(j|t)sx?$/, /\.tsrx(?:$|\?)/],
				code: { include: routeFactoryCallCodeFilter },
			},
			handler(code, id) {
				const normalizedId = normalizePath(id);
				const routeEntry = routerPluginContext.routesByFile.get(normalizedId);
				if (!routeEntry) return null;
				if (debug) console.info('Adding HMR handling to route ', normalizedId);
				const hmrStyle = userConfig.plugin?.hmr?.style ?? 'vite';
				if (userConfig.target === 'react') {
					const compilerPlugins = getReferenceRouteCompilerPlugins({
						targetFramework: 'react',
						addHmr: true,
						hmrStyle,
					});
					const compiled = compileCodeSplitReferenceRoute({
						code,
						filename: normalizedId,
						id: normalizedId,
						addHmr: true,
						hmrStyle,
						hmrRouteId: routeEntry.routeId,
						codeSplitGroupings: [],
						targetFramework: 'react',
						compilerPlugins,
					});
					if (compiled) {
						if (debug) {
							logDiff(code, compiled.code);
							console.log('Output:\n', compiled.code + '\n\n');
						}
						return compiled;
					}
				}
				const ast = parseAst({
					code,
					filename: normalizedId,
				});
				ast.program.body.push(
					...createRouteHmrStatement([], {
						hmrStyle,
						targetFramework: userConfig.target,
						routeId: routeEntry.routeId,
					}),
				);
				const result = generateFromAst(ast, {
					sourceMaps: true,
					filename: normalizedId,
					sourceFileName: normalizedId,
				});
				if (debug) {
					logDiff(code, result.code);
					console.log('Output:\n', result.code + '\n\n');
				}
				return result;
			},
		},
		vite: {
			configResolved(config) {
				ROOT = config.root;
				userConfig = resolveUserConfig();
				validateFrameworkPluginOrder({
					framework: userConfig.target,
					plugins: config.plugins,
					routerPluginName: 'tanstack-router:hmr',
				});
			},
			applyToEnvironment(environment) {
				if (userConfig.plugin?.vite?.environmentName)
					return userConfig.plugin.vite.environmentName === environment.name;
				return true;
			},
		},
	};
}
//#endregion
export { createRouterHmrPlugin };
