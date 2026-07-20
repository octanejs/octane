// @ts-check
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
	RenderRoute,
	ServerRoute,
	defineConfig,
	createRouter,
	is_rpc_request,
} from '@octanejs/app-core';
import {
	getOctaneConfigPath,
	loadOctaneConfig,
	loadOctaneConfigWithMetadata,
	octaneConfigExists,
} from '@octanejs/app-core/config-loader';
import {
	SERVER_ONLY_ADAPTER_IDS,
	create_adapter_browser_stub_source,
	create_client_entry_source,
	generateServerEntry,
	generateServerManifestEntry,
	write_project_generated_file,
} from '@octanejs/app-core/codegen';
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { createOctaneCompiler } from 'octane/compiler/bundler';

import { finalizeOctaneRsbuildOutput } from './build.js';
import { OctaneClientAssetsPlugin } from './client-assets-plugin.js';
import { createOctaneDevMiddleware } from './dev-server.js';
import { markHydrationEntry } from './html.js';
import {
	collectClientEntries,
	discoverServerModules,
	resolveOctaneSourceRoots,
	resolveProjectModule,
} from './project.js';

export * from '@octanejs/app-core';
export { getOctaneConfigPath, loadOctaneConfig, loadOctaneConfigWithMetadata, octaneConfigExists };

const PLUGIN_NAME = '@octanejs/rsbuild-plugin';
const CLIENT_ENTRY_NAME = 'index';
const SERVER_ENTRY_NAME = 'entry';
const CLIENT_ASSET_MAP = 'octane-client-assets.json';
const localRequire = createRequire(import.meta.url);
const SWC_ES_TARGETS = new Set([
	'es3',
	'es5',
	'es2015',
	'es2016',
	'es2017',
	'es2018',
	'es2019',
	'es2020',
	'es2021',
	'es2022',
	'es2023',
	'es2024',
	'esnext',
]);
const MODULE_BROWSER_TARGETS = [
	'chrome >= 87',
	'edge >= 88',
	'firefox >= 78',
	'ios_saf >= 14',
	'safari >= 14',
];

/** @param {string} target */
function esTargetRank(target) {
	if (target === 'es3') return 3;
	if (target === 'es5') return 5;
	if (target === 'esnext') return Number.POSITIVE_INFINITY;
	return Number(target.slice(2));
}

/** @param {string} target */
function toBrowserslistTarget(target) {
	const match = /^(android|chrome|edge|firefox|ie|ios|opera|safari|node)(\d+(?:\.\d+)*)$/.exec(
		target,
	);
	if (!match) {
		throw new Error(
			`[@octanejs/rsbuild-plugin] Unsupported build.target ${JSON.stringify(target)}. Use an ES target, "modules", or an esbuild-style browser target such as "chrome100".`,
		);
	}
	const browser = match[1] === 'ios' ? 'ios_saf' : match[1];
	return `${browser} >= ${match[2]}`;
}

/** @param {import('@octanejs/app-core').BuildTarget} target */
function createBuildTargetPlan(target) {
	if (target === false) {
		return { swcTarget: 'esnext', rspackTarget: 'es2024', browserslist: null };
	}
	const targets = (Array.isArray(target) ? target : [target]).map((entry) =>
		entry === 'es6' ? 'es2015' : entry,
	);
	if (targets.length === 0) {
		throw new Error('[@octanejs/rsbuild-plugin] build.target must not be an empty array.');
	}
	if (targets.every((entry) => SWC_ES_TARGETS.has(entry))) {
		const swcTarget = [...targets].sort(
			(left, right) => esTargetRank(left) - esTargetRank(right),
		)[0];
		return {
			swcTarget,
			rspackTarget: swcTarget === 'esnext' ? 'es2024' : swcTarget,
			browserslist: null,
		};
	}
	if (targets.some((entry) => SWC_ES_TARGETS.has(entry))) {
		throw new Error(
			'[@octanejs/rsbuild-plugin] build.target cannot mix ES levels and browser targets. Use one ES level or browser targets only.',
		);
	}
	const browserslist = targets.flatMap((entry) =>
		entry === 'modules' ? MODULE_BROWSER_TARGETS : [toBrowserslistTarget(entry)],
	);
	return {
		swcTarget: browserslist,
		rspackTarget: `browserslist:${browserslist.join(',')}`,
		browserslist,
	};
}

/** @param {import('@octanejs/app-core').ResolvedOctaneConfig | null} config */
function hasRoutes(config) {
	return (config?.router.routes.length ?? 0) > 0;
}

/** @param {import('@octanejs/app-core').ResolvedOctaneConfig} config */
function configSignature(config) {
	return JSON.stringify({
		build: config.build,
		routes: config.router.routes.map((route) =>
			route.type === 'render'
				? {
						type: route.type,
						path: route.path,
						entry: route.entry,
						layout: route.layout,
						status: route.status,
					}
				: { type: route.type, path: route.path, methods: route.methods },
		),
		preHydrate: config.router.preHydrate,
		rootBoundary: config.rootBoundary,
		server: config.server,
		compiler: { renderers: config.compiler.renderers.signature },
	});
}

/** @param {string} value */
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} file Match an exact absolute resource path on POSIX or Windows. */
function exactResourceRegExp(file) {
	const logical = path.resolve(file);
	let physical = logical;
	try {
		physical = fs.realpathSync(logical);
	} catch {
		// The generated entry is normally present already; retain the logical path
		// if a custom output filesystem makes it unavailable during setup.
	}
	const patterns = [...new Set([logical, physical])].map((candidate) =>
		candidate.split(/[/\\]/).map(escapeRegExp).join('[/\\\\]'),
	);
	return new RegExp(`^(?:${patterns.join('|')})$`);
}

/** @param {ReturnType<typeof createBuildTargetPlan>} plan */
function createSwcTargetConfig(plan) {
	return (/** @type {import('@rspack/core').SwcLoaderOptions} */ options) => {
		if (typeof plan.swcTarget === 'string') {
			options.env = undefined;
			options.jsc = {
				...options.jsc,
				target: /** @type {any} */ (plan.swcTarget),
			};
			return;
		}
		if (options.jsc) delete options.jsc.target;
		options.env = { ...options.env, targets: plan.swcTarget };
	};
}

/** @param {any} resolveOptions @param {string} key @param {string | false} value */
function addExactAlias(resolveOptions, key, value) {
	const aliases = resolveOptions.alias === false ? {} : (resolveOptions.alias ?? {});
	resolveOptions.alias = { ...aliases, [`${key}$`]: value };
}

/** @param {import('@rsbuild/core').RsbuildPluginAPI['logger']} logger */
function createLog(logger) {
	return (/** @type {string} */ message) => logger.info(`[octane] ${message}`);
}

/** @param {any} config @param {string} clientEnvironment */
function assertRootPublicPaths(config, clientEnvironment) {
	const base = config.server?.base;
	if (base !== undefined && base !== '/') {
		throw new Error(
			'[@octanejs/rsbuild-plugin] App mode currently requires server.base to be "/". Rewrite a deployment subpath to the app root at your proxy.',
		);
	}
	const assetPrefixes = [
		config.output?.assetPrefix,
		config.environments?.[clientEnvironment]?.output?.assetPrefix,
	];
	if (assetPrefixes.some((prefix) => prefix !== undefined && prefix !== 'auto' && prefix !== '/')) {
		throw new Error(
			'[@octanejs/rsbuild-plugin] App mode currently supports only the default output.assetPrefix ("auto" or "/").',
		);
	}
}

/**
 * Full Octane app integration for Rsbuild 2.x. Without route config it remains
 * a thin compiler integration and leaves the user's environments/entries alone.
 *
 * @param {{
 *   hmr?: boolean,
 *   profile?: boolean,
 *   exclude?: string[],
 *   requireDirective?: boolean,
 *   clientEnvironment?: string,
 *   serverEnvironment?: string,
 * }} [inlineOptions]
 * @returns {import('@rsbuild/core').RsbuildPlugin}
 */
export function pluginOctane(inlineOptions = {}) {
	return {
		name: PLUGIN_NAME,
		enforce: 'pre',
		async setup(api) {
			const root = path.resolve(api.context.rootPath);
			const isProductionBuild = () => api.context.action === 'build';
			const clientEnvironment = inlineOptions.clientEnvironment ?? 'web';
			const serverEnvironment = inlineOptions.serverEnvironment ?? 'node';
			const generatedDir = path.join(api.context.cachePath, 'octane');
			const generatedOptions = { root, generatedDir };
			const configPath = getOctaneConfigPath(root);
			const initialLoaded = octaneConfigExists(root)
				? await loadOctaneConfigWithMetadata(root, {
						cacheDir: path.join(generatedDir, 'config'),
					})
				: null;
			const initialConfig = initialLoaded?.config ?? null;
			const appEnabled = hasRoutes(initialConfig);
			const buildTargetPlan =
				initialConfig?.build.target === undefined
					? null
					: createBuildTargetPlan(initialConfig.build.target);
			const neutralCompiler = appEnabled ? createOctaneCompiler({ root }) : null;
			let currentConfig = initialConfig;
			let lastConfigSignature = initialLoaded ? configSignature(initialLoaded.config) : '';
			let configNeedsReload = false;
			/** @type {import('@rsbuild/core').RsbuildDevServer | null} */
			let devServer = null;

			const clientEntryFile = write_project_generated_file(
				generatedOptions,
				'rsbuild-client-entry.js',
				'// Replaced by @octanejs/rsbuild-plugin during compilation.\n',
			);
			const serverEntryFile = write_project_generated_file(
				generatedOptions,
				'rsbuild-server-entry.js',
				'// Replaced by @octanejs/rsbuild-plugin during compilation.\n',
			);
			const adapterBrowserStub = write_project_generated_file(
				generatedOptions,
				'adapter-browser-stub.js',
				create_adapter_browser_stub_source(),
			);

			/** @param {any} context @param {any} metadata */
			function registerConfigDependencies(context, metadata) {
				if (!context || !metadata || typeof metadata !== 'object') return;
				for (const dependency of metadata.dependencies ?? []) {
					if (typeof dependency === 'string') context.addDependency(dependency);
				}
				for (const dependency of metadata.missingDependencies ?? []) {
					if (typeof dependency === 'string') context.addMissingDependency(dependency);
				}
			}

			/** @param {any} [context] */
			async function loadCurrentConfig(context) {
				let loaded;
				try {
					loaded = await loadOctaneConfigWithMetadata(root, {
						cacheDir: path.join(generatedDir, 'config'),
					});
				} catch (error) {
					// Failed config evaluation still reports every consulted dependency.
					// Register it before rethrowing so editing the broken helper retriggers
					// compilation without restarting the dev server.
					registerConfigDependencies(context, error);
					throw error;
				}
				registerConfigDependencies(context, loaded);
				const signature = configSignature(loaded.config);
				if (lastConfigSignature && signature !== lastConfigSignature) configNeedsReload = true;
				lastConfigSignature = signature;
				currentConfig = loaded.config;
				return loaded;
			}

			function discoverCompilerSources() {
				if (!neutralCompiler) {
					return {
						packages: [],
						dependencies: [],
						missingDependencies: [],
						sourceRoots: [root],
					};
				}
				// Entry transforms run after watched invalidations. Re-evaluate package
				// manifests so adding/removing a linked raw Octane dependency does not
				// require restarting the Rsbuild dev server.
				neutralCompiler.invalidate();
				const metadata = neutralCompiler.discoverSourceDependencies();
				return {
					...metadata,
					sourceRoots: resolveOctaneSourceRoots(root, metadata.packages),
				};
			}

			api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
				// Renderer selection is serialized into each Rspack compiler's loader
				// options, so a browser reload cannot apply config changes safely. Ask
				// Rsbuild to reconstruct the dev server (and therefore every compiler)
				// whenever the Octane config or one of its imported helpers changes.
				// This also covers compiler-only projects without application routes.
				const watchedConfig = initialLoaded
					? mergeRsbuildConfig(config, {
							dev: {
								watchFiles: {
									paths: [...initialLoaded.dependencies],
									type: 'reload-server',
								},
							},
						})
					: config;
				if (!appEnabled) return watchedConfig;
				assertRootPublicPaths(watchedConfig, clientEnvironment);
				const productionBuild = isProductionBuild();
				const octaneConfig = /** @type {import('@octanejs/app-core').ResolvedOctaneConfig} */ (
					initialConfig
				);
				const webWorkerServer =
					productionBuild && octaneConfig.adapter?.serverTarget === 'webworker';
				const template = path.join(root, 'index.html');
				if (!fs.existsSync(template)) {
					throw new Error(
						'[@octanejs/rsbuild-plugin] index.html not found — required when octane.config.ts defines routes.',
					);
				}
				const outputMinify =
					octaneConfig.build.minify === undefined ? {} : { minify: octaneConfig.build.minify };
				const targetConfig = buildTargetPlan
					? { tools: { swc: createSwcTargetConfig(buildTargetPlan) } }
					: {};
				const targetOutput = buildTargetPlan?.browserslist
					? { overrideBrowserslist: buildTargetPlan.browserslist }
					: {};
				return mergeRsbuildConfig(watchedConfig, {
					server: { htmlFallback: false, historyApiFallback: false },
					environments: {
						[clientEnvironment]: {
							...targetConfig,
							source: { entry: { [CLIENT_ENTRY_NAME]: clientEntryFile } },
							html: { template },
							output: {
								...targetOutput,
								target: 'web',
								distPath: { root: path.resolve(root, octaneConfig.build.outDir, 'client') },
								filename: { html: 'index.html' },
								...outputMinify,
							},
						},
						[serverEnvironment]: {
							...targetConfig,
							source: {
								entry: {
									[SERVER_ENTRY_NAME]: { import: [serverEntryFile], html: false },
								},
							},
							output: {
								...targetOutput,
								target: webWorkerServer ? 'web-worker' : 'node',
								autoExternal: false,
								distPath: {
									root: path.resolve(root, octaneConfig.build.outDir, 'server'),
									js: '',
									jsAsync: '',
								},
								filename: { js: '[name].js' },
								filenameHash: false,
								// Rsbuild rejects its public ESM switch for web-worker targets.
								// The final Rspack config enables module output below so the
								// adapter wrapper can import createWebWorkerHandler.
								module: productionBuild && !webWorkerServer,
								emitAssets: false,
								...outputMinify,
							},
						},
					},
				});
			});

			api.modifyEnvironmentConfig((config, { mergeEnvironmentConfig }) => {
				// Octane and several framework bindings use this conventional guard for
				// diagnostics and production-only branches. Rsbuild does not define it
				// when a programmatic build inherits mode "none". Browser output always
				// needs a replacement because `process` is absent; production Node output
				// also needs one so Rspack can remove DEV-only diagnostics without relying
				// on minification. Keep the Node dev server runtime-controlled.
				const productionBuild = isProductionBuild();
				if (config.output.target === 'node' && !productionBuild) return config;
				return mergeEnvironmentConfig(config, {
					source: {
						define: {
							'process.env.NODE_ENV': JSON.stringify(
								productionBuild ? 'production' : 'development',
							),
						},
					},
				});
			});

			if (appEnabled) {
				api.transform(
					{
						test: exactResourceRegExp(clientEntryFile),
						environments: [clientEnvironment],
						order: 'pre',
					},
					async (context) => {
						const loaded = await loadCurrentConfig(context);
						const compilerDiscovery = discoverCompilerSources();
						for (const dependency of compilerDiscovery.dependencies) {
							context.addDependency(dependency);
						}
						for (const dependency of compilerDiscovery.missingDependencies) {
							context.addMissingDependency(dependency);
						}
						const entries = collectClientEntries(loaded.config).map((id) => ({
							id,
							specifier: resolveProjectModule(id, root),
						}));
						return create_client_entry_source({
							staticEntries: entries,
							generatedBy: PLUGIN_NAME,
						});
					},
				);

				api.transform(
					{
						test: exactResourceRegExp(serverEntryFile),
						environments: [serverEnvironment],
						order: 'pre',
					},
					async (context) => {
						const loaded = await loadCurrentConfig(context);
						const compilerDiscovery = discoverCompilerSources();
						for (const dependency of compilerDiscovery.dependencies) {
							context.addDependency(dependency);
						}
						for (const dependency of compilerDiscovery.missingDependencies) {
							context.addMissingDependency(dependency);
						}
						const serverModules = discoverServerModules(root, compilerDiscovery.sourceRoots);
						for (const directory of serverModules.directories) {
							context.addContextDependency(directory);
						}
						for (const file of serverModules.files) context.addDependency(file);
						// Build intent, not optimization mode, selects the bootable entry. A
						// programmatic `rsbuild.build()` may intentionally keep development
						// transforms while still requiring production output/finalization.
						const production = isProductionBuild();
						const webWorkerServer =
							production && loaded.config.adapter?.serverTarget === 'webworker';
						const generator = production ? generateServerEntry : generateServerManifestEntry;
						return generator({
							routes: loaded.config.router.routes,
							octaneConfigPath: loaded.configPath,
							configImportPath: loaded.configPath,
							rootBoundary: loaded.config.rootBoundary,
							rpcModulePaths: serverModules.ids,
							...(webWorkerServer ? { mode: 'webworker' } : null),
							...(production && !webWorkerServer
								? { clientAssetMapFile: CLIENT_ASSET_MAP }
								: { clientAssetMap: {} }),
							resolveImport: (id) => resolveProjectModule(id, root),
							configModuleId: localRequire.resolve('@octanejs/app-core/config'),
							productionModuleId: localRequire.resolve('@octanejs/app-core/production'),
							nodeModuleId: localRequire.resolve('@octanejs/app-core/node'),
							generatedBy: PLUGIN_NAME,
						});
					},
				);
			}

			api.modifyRspackConfig((config, utils) => {
				const productionBuild = isProductionBuild();
				const environment =
					utils.environment.name === serverEnvironment || utils.isServer ? 'server' : 'client';
				const webWorkerServer =
					productionBuild &&
					environment === 'server' &&
					initialConfig?.adapter?.serverTarget === 'webworker';
				if (buildTargetPlan) {
					config.target = /** @type {any} */ ([
						environment === 'server' ? (webWorkerServer ? 'webworker' : 'node') : 'web',
						buildTargetPlan.rspackTarget,
					]);
				}
				config.plugins ??= [];
				config.plugins.push(
					new OctaneRspackPlugin({
						root,
						environment,
						transpile: false,
						...(inlineOptions.hmr === undefined ? null : { hmr: inlineOptions.hmr }),
						...(inlineOptions.profile === undefined
							? null
							: { profile: environment === 'client' && inlineOptions.profile }),
						...(inlineOptions.exclude === undefined ? null : { exclude: inlineOptions.exclude }),
						...(inlineOptions.requireDirective === undefined
							? null
							: { requireDirective: inlineOptions.requireDirective }),
						renderers: initialConfig?.compiler.renderers,
					}),
				);
				config.resolve ??= {};
				addExactAlias(
					config.resolve,
					'@octanejs/rsbuild-plugin',
					localRequire.resolve('./config-entry.js'),
				);
				addExactAlias(
					config.resolve,
					'@octanejs/vite-plugin',
					localRequire.resolve('./config-entry.js'),
				);
				if (appEnabled && environment === 'server') {
					config.output ??= {};
					if (webWorkerServer) {
						// Rsbuild's web-worker target is script-only at its public config
						// layer. The generated entry is an importable adapter input, so
						// retain its named factory export in an ESM Rspack library.
						config.experiments ??= {};
						/** @type {any} */ (config.experiments).outputModule = true;
						config.output.module = true;
						config.output.chunkFilename = 'chunks/[name].js';
						config.output.chunkFormat = 'module';
						config.output.chunkLoading = 'import';
						config.output.workerChunkLoading = 'import';
						config.optimization ??= {};
						config.optimization.minimize = initialConfig?.build.minify ?? true;
						// Workers with compatibility modules (including Cloudflare's
						// nodejs_compat) resolve `node:` imports as native ESM. Install
						// this before Rspack attempts to treat the scheme as browser code.
						config.plugins ??= [];
						config.plugins.push(new utils.rspack.ExternalsPlugin('module', /^node:/));
						config.externalsType = 'module';
					}
					config.output.library = { type: productionBuild ? 'module' : 'commonjs2' };
					if (productionBuild) {
						config.module ??= {};
						config.module.rules ??= [];
						// The generated entry must retain native import.meta.url for its
						// colocated HTML/asset-map lookup. Scope that exception exactly so
						// application modules keep Rspack's import-meta/new-URL handling.
						config.module.rules.push({
							test: exactResourceRegExp(serverEntryFile),
							parser: { importMeta: false },
						});
					}
				}

				if (environment === 'client') {
					for (const adapterId of SERVER_ONLY_ADAPTER_IDS) {
						addExactAlias(config.resolve, adapterId, adapterBrowserStub);
					}
					if (appEnabled) {
						config.plugins.push(
							new OctaneClientAssetsPlugin({
								root,
								clientEntry: clientEntryFile,
								entries: () =>
									collectClientEntries(
										/** @type {import('@octanejs/app-core').ResolvedOctaneConfig} */ (
											currentConfig
										),
									),
								filename: CLIENT_ASSET_MAP,
							}),
						);
					}
				}
				return config;
			});

			if (!appEnabled) return;

			api.modifyHTML((html, context) => {
				if (context.environment.name !== clientEnvironment) return html;
				const entrypoint = context.compilation.entrypoints.get(CLIENT_ENTRY_NAME);
				const entryFiles = entrypoint?.getEntrypointChunk().files ?? [];
				return markHydrationEntry(html, entryFiles);
			});

			api.onBeforeStartDevServer(({ server }) => {
				devServer = server;
				const publicRoots = api
					.getNormalizedConfig()
					.server.publicDir.map((entry) => path.resolve(root, entry.name));
				const middleware = createOctaneDevMiddleware({
					server,
					clientEnvironment,
					serverEnvironment,
					clientEntry: CLIENT_ENTRY_NAME,
					serverEntry: SERVER_ENTRY_NAME,
					publicRoots,
					logError(message, error) {
						api.logger.error(`${message}: ${error instanceof Error ? error.stack : String(error)}`);
					},
				});
				// Register before Rsbuild's HTML completion middleware so application
				// routes reach SSR. This middleware yields emitted, internal, and public
				// URLs back to Rsbuild.
				server.middlewares.use(middleware);
			});

			api.onAfterDevCompile(() => {
				if (!configNeedsReload || !devServer) return;
				configNeedsReload = false;
				devServer.environments[clientEnvironment]?.hot.send('full-reload');
			});

			api.onAfterBuild(async ({ stats }) => {
				if (stats?.hasErrors()) return;
				const loaded = await loadCurrentConfig();
				await finalizeOctaneRsbuildOutput({
					root,
					config: loaded.config,
					assetMapFilename: CLIENT_ASSET_MAP,
					log: createLog(api.logger),
				});
			});
		},
	};
}

/** Alias matching the Vite metaframework package. */
export const octane = pluginOctane;
