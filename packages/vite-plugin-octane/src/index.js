// @ts-check
/** @import {Plugin, RenderBuiltAssetUrl, ResolvedConfig, ViteDevServer, UserConfig} from 'vite' */
/** @import {LoadedOctaneConfig, OctaneConfigOptions, ResolvedOctaneConfig, RenderRoute} from '@octanejs/vite-plugin' */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';

import { octane as octaneCompiler } from 'octane/compiler/vite';

import { createRouter } from './server/router.js';
import { createContext, runMiddlewareChain } from './server/middleware.js';
import { handleRenderRoute } from './server/render-route.js';
import { handleServerRoute } from './server/server-route.js';
import { HYDRATION_NONCE_PLACEHOLDER, injectHydrationEntry } from './server/html-template.js';
import { generateServerEntry } from './server/virtual-entry.js';
import { nodeRequestToWebRequest, sendWebResponse } from './server/node-http.js';
import { ENTRY_FILENAME } from './constants.js';
import {
	getOctaneConfigPath,
	loadOctaneConfig,
	loadOctaneConfigWithMetadata,
	resolveOctaneConfig,
	octaneConfigExists,
} from './load-config.js';
import {
	RESOLVED_ADAPTER_BROWSER_STUB_ID,
	SERVER_ONLY_ADAPTER_IDS,
	create_adapter_browser_stub_source,
	create_client_entry_source,
	to_vite_root_import,
	write_project_generated_file,
} from './project-codegen.js';
import { createClientAssetMap } from './client-assets.js';

import { patch_global_fetch, is_rpc_request, handle_rpc_request } from '@ripple-ts/adapter/rpc';

import { get_route_entry_path } from './routes.js';

// Re-export route classes + config helpers (public API surface).
export { RenderRoute, ServerRoute } from './routes.js';
export { OCTANE_NONCE_STATE_KEY } from './constants.js';
export {
	DEFAULT_OUTDIR,
	ENTRY_FILENAME,
	compose,
	createContext,
	createRouter,
	get_component_export,
	get_route_entry_export_name,
	get_route_entry_id,
	get_route_entry_path,
	handleServerRoute,
	is_rpc_request,
	runMiddlewareChain,
} from '@octanejs/app-core';
export {
	getOctaneConfigPath,
	loadOctaneConfig,
	loadOctaneConfigWithMetadata,
	resolveOctaneConfig,
	octaneConfigExists,
} from './load-config.js';

const VIRTUAL_HYDRATE_ID = 'virtual:octane-hydrate';
const RESOLVED_VIRTUAL_HYDRATE_ID = '\0virtual:octane-hydrate';
const requireFromPlugin = createRequire(import.meta.url);
// Mirrors octane/compiler/vite's full-compiler surface. Keeping this list in
// sync is especially important for production `module server` discovery.
const OCTANE_EXTENSIONS = ['.tsrx', '.tsx'];

/**
 * @param {string} file_name
 * @returns {boolean}
 */
function is_octane_module_path(file_name) {
	return OCTANE_EXTENSIONS.some((extension) => file_name.endsWith(extension));
}

// Query params that mark a Vite transform request (`/src/x.svg?url`,
// `/src/worker?worker`, …). `?v=`/`?t=` module URLs always carry an extension,
// so the extension check below already covers them.
const VITE_QUERY_MARKERS = ['import', 'direct', 'raw', 'url', 'worker', 'sharedworker', 'inline'];

/**
 * Is this a request the Vite dev server owns (module/asset/internal), as
 * opposed to a page navigation? A catch-all RenderRoute ('/*splat') must not
 * SSR `/@vite/client` or `/src/main.ts` — those must fall through to Vite's
 * transform middleware. Exported for tests.
 *
 * A dot in the last path segment is NOT enough to claim a request: page URLs
 * like `/docs/v2.0` or `/users/jane.doe` carry one too. So an extension only
 * marks a Vite-owned request when the path names a REAL file under one of
 * `fileRoots` (the Vite root + publicDir — what the dev server can actually
 * serve). With no `fileRoots` the check stays the conservative heuristic
 * (any extension → Vite-owned).
 *
 * @param {URL} url
 * @param {string[]} [fileRoots]
 * @returns {boolean}
 */
export function isViteOwnedUrl(url, fileRoots) {
	const pathname = url.pathname;
	// Vite-internal namespaces: /@vite/client, /@id/…, /@fs/…, /@react-refresh.
	if (pathname.startsWith('/@')) return true;
	// Vite/devtools internals: /__open-in-editor, /__inspect, …
	if (pathname.startsWith('/__')) return true;
	if (pathname.includes('/node_modules/')) return true;
	// Vite emits its transform queries as BARE markers (`?url`, `?raw`,
	// `?worker`, `&import`) — only an EMPTY value counts. A valued param
	// (`/docs?url=https://example.com`) is an app query string on a page
	// navigation, not a transform request.
	for (const marker of VITE_QUERY_MARKERS) {
		if (url.searchParams.get(marker) === '') return true;
	}
	// A file extension marks a module/asset request (/src/main.ts, /favicon.svg)
	// — but only when a real file backs it (see above). (dot > 0 so a bare
	// dotfile segment like '/.well-known' doesn't count.)
	const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
	if (lastSegment.lastIndexOf('.') > 0) {
		if (fileRoots === undefined) return true;
		let relPath;
		try {
			relPath = decodeURIComponent(pathname);
		} catch {
			relPath = pathname;
		}
		return fileRoots.some((root) => fs.existsSync(path.join(root, relPath)));
	}
	return false;
}

/** @type {import('@ripple-ts/adapter/rpc').AsyncContext | null} */
let devAsyncContext = null;

/**
 * Get (or lazily create) the dev server's async context — Node.js
 * AsyncLocalStorage by default, or the adapter's runtime context if provided.
 * Patches global fetch once so relative-URL fetch + RPC work in dev.
 *
 * @param {OctaneConfigOptions | null} config
 * @returns {import('@ripple-ts/adapter/rpc').AsyncContext}
 */
function getDevAsyncContext(config) {
	if (devAsyncContext) return devAsyncContext;

	const adapterRuntime = config?.adapter?.runtime;
	if (adapterRuntime?.createAsyncContext) {
		devAsyncContext = adapterRuntime.createAsyncContext();
	} else {
		const als = new AsyncLocalStorage();
		devAsyncContext = {
			run: (store, fn) => als.run(store, fn),
			getStore: () => als.getStore(),
		};
	}

	patch_global_fetch(devAsyncContext);
	return devAsyncContext;
}

/**
 * @param {ResolvedOctaneConfig | null} config
 * @returns {boolean}
 */
function has_route_config(config) {
	return (config?.router.routes.length ?? 0) > 0;
}

/**
 * Every module path the server can name in #__octane_data — page entries,
 * layouts, the preHydrate hook, and root boundaries. The generated hydrate
 * entry maps each as a LITERAL `() => import('/src/…')`. Production needs the
 * map so Rollup chunks and hashes the modules; dev needs it so the imports go
 * through Vite's import analysis and share URL identity with every other
 * importer (see the hydrate-entry load hook).
 *
 * @param {ResolvedOctaneConfig | null} config
 * @returns {string[]}
 */
function collect_hydrate_module_paths(config) {
	if (!has_route_config(config)) return [];
	const cfg = /** @type {ResolvedOctaneConfig} */ (config);
	const entries = cfg.router.routes
		.filter((r) => r.type === 'render')
		.flatMap((r) => [get_route_entry_path(/** @type {RenderRoute} */ (r).entry), r.layout]);
	if (cfg.router.preHydrate) entries.push(cfg.router.preHydrate);
	entries.push(
		get_route_entry_path(cfg.rootBoundary.pending),
		get_route_entry_path(cfg.rootBoundary.catch),
	);
	return [...new Set(entries.filter((e) => typeof e === 'string'))];
}

/**
 * The recommended Octane Vite integration. With no octane.config.ts it behaves
 * as a compiler plugin inside a normal Vite SPA; configured routes activate the
 * metaframework layer.
 *
 * Returns an ARRAY: `[octaneCompiler(options), metaPlugin]`. The first element is
 * octane/compiler's transform plugin — it owns ALL `.tsrx` compilation, picking
 * client vs server mode per-module from Vite's SSR signal (so the SAME file
 * compiles to a DOM-clone client body for the browser and to an HTML-building
 * server body when pulled via `ssrLoadModule`). The metaPlugin owns config,
 * routing, dev SSR, the client hydrate virtual module, and dev RPC.
 *
 * PRODUCTION (`vite build`, when octane.config.ts has routes): the client
 * build is redirected to `{outDir}/client` with a manifest, the hydrate entry
 * is injected into index.html (so Vite bundles + hashes it), and closeBundle
 * runs a second, `ssr: true` build of a generated server entry to
 * `{outDir}/server/entry.js` — a self-contained module (app + octane bundled,
 * node builtins external) exporting `handler`/`nodeHandler` and auto-booting
 * under `node`. See server/virtual-entry.js and server/production.js.
 *
 * @param {{ hmr?: boolean, profile?: boolean, exclude?: string[], renderers?: import('@octanejs/app-core').ExperimentalRendererConfigOptions }} [inlineOptions]
 * @returns {Plugin[]}
 */
export function octane(inlineOptions = {}) {
	/** @type {ResolvedConfig} */
	let config;
	/** @type {string} */
	let root;
	/** @type {ResolvedOctaneConfig | null} */
	let octaneConfig = null;
	/** @type {ReturnType<typeof createRouter> | null} */
	let router = null;
	/** @type {boolean} */
	let isBuild = false;
	/** @type {boolean} Is this the SSR sub-build closeBundle launches? */
	let isSSRBuild = false;
	/**
	 * Config dependencies that select compiler renderers. A change requires a
	 * server restart because the neutral compiler snapshots normalized renderer
	 * metadata before the first module transform.
	 * @type {Set<string>}
	 */
	const rendererConfigWatchFiles = new Set();
	/** @type {Map<string, Promise<LoadedOctaneConfig | null>>} */
	const startupConfigLoads = new Map();
	/** @type {ResolvedOctaneConfig | null} Config loaded for the build (config hook, reused in closeBundle) */
	let buildOctaneConfig = null;
	/** @type {string[]} Module paths the generated client entry maps statically (build only) */
	let staticEntries = [];
	/** @type {Set<string>} Vite-root paths of modules containing `module server` */
	const serverModuleModules = new Set();

	/**
	 * Load declarative app config early enough for the compiler plugin's own
	 * `config` hook. Cache per project root for the paired compiler/meta hooks;
	 * a dev-server restart constructs a fresh plugin instance and fresh snapshot.
	 *
	 * @param {string} projectRoot
	 * @returns {Promise<LoadedOctaneConfig | null>}
	 */
	function loadStartupConfig(projectRoot) {
		const resolvedRoot = path.resolve(projectRoot);
		let load = startupConfigLoads.get(resolvedRoot);
		if (load !== undefined) return load;
		load = octaneConfigExists(resolvedRoot)
			? loadOctaneConfigWithMetadata(resolvedRoot)
			: Promise.resolve(null);
		startupConfigLoads.set(resolvedRoot, load);
		return load;
	}

	/** @type {Plugin} */
	const metaPlugin = {
		name: '@octanejs/vite-plugin',

		/**
		 * @param {UserConfig} userConfig
		 * @param {import('vite').ConfigEnv} env
		 */
		async config(userConfig, env) {
			isBuild = env?.command === 'build';
			isSSRBuild = !!userConfig.build?.ssr;
			const projectRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
			const hasOctaneConfig = octaneConfigExists(projectRoot);

			const exclude = userConfig.optimizeDeps?.exclude || [];
			const base = {
				// A zero-config project is a normal Vite SPA: leave appType unset so
				// Vite retains its HTML transform and history fallback. An Octane app
				// config opts into framework routing, where SSR owns navigation and the
				// SPA fallback must not mask unmatched routes. Respect an explicit user
				// appType, and leave `vite preview` alone — production SSR is previewed
				// with `octane-preview` (it serves dist/server), not `vite preview`.
				...(hasOctaneConfig && userConfig.appType === undefined && !env?.isPreview
					? { appType: /** @type {const} */ ('custom') }
					: {}),
				optimizeDeps: {
					exclude: [
						// The compiler plugin has already added every manifest-discovered
						// raw Octane dependency to `exclude`; preserve that list here.
						...new Set([...exclude, 'octane', 'octane/compiler', ...SERVER_ONLY_ADAPTER_IDS]),
					],
				},
				// Raw binding packages are supplied recursively by the compiler plugin;
				// these core entrypoints remain explicit metaframework dependencies.
				ssr: {
					noExternal: ['octane', 'octane/compiler'],
				},
			};

			// Production CLIENT build (the SSR sub-build closeBundle launches passes
			// build.ssr, so it skips this): route the client bundle to
			// `{outDir}/client` and emit a manifest for the server's asset map.
			if (isBuild && !isSSRBuild) {
				if (hasOctaneConfig) {
					buildOctaneConfig = await loadOctaneConfig(projectRoot);
					if (has_route_config(buildOctaneConfig)) {
						if (!fs.existsSync(path.join(projectRoot, 'index.html'))) {
							throw new Error(
								'[@octanejs/vite-plugin] index.html not found — required for SSR builds with octane.config.ts routes.',
							);
						}
						/** @type {import('vite').UserConfig['build']} */
						const buildConfig = {
							outDir: `${buildOctaneConfig.build.outDir}/client`,
							emptyOutDir: true,
							manifest: true,
						};
						if (buildOctaneConfig.build.minify !== undefined) {
							buildConfig.minify = buildOctaneConfig.build.minify;
						}
						if (buildOctaneConfig.build.target !== undefined) {
							buildConfig.target = buildOctaneConfig.build.target;
						}
						const userRenderBuiltUrl = userConfig.experimental?.renderBuiltUrl;
						/** @type {RenderBuiltAssetUrl} */
						const renderBuiltUrl = (filename, context) => {
							const userResult = userRenderBuiltUrl?.(filename, context);
							if (userResult !== undefined) return userResult;

							// Vite's production module-preload helper otherwise resolves its
							// root-relative dependency URLs through document.baseURI. Generate
							// module-relative JS asset URLs so an authored <base> cannot redirect
							// route, layout, or pre-hydrate chunk preloads off the app origin.
							if (!context.ssr && context.type === 'asset' && context.hostType === 'js') {
								return { relative: true };
							}
						};
						return {
							...base,
							build: buildConfig,
							experimental: {
								...userConfig.experimental,
								renderBuiltUrl,
							},
						};
					}
				}
			}

			return base;
		},

		/**
		 * Production client build: collect every module path the server can name
		 * in #__octane_data (page entries, layouts, the preHydrate hook) so the
		 * generated hydrate entry maps them as STATIC dynamic imports Rollup can
		 * chunk and hash.
		 */
		buildStart() {
			if (!isBuild || isSSRBuild || !has_route_config(buildOctaneConfig)) return;
			serverModuleModules.clear();
			staticEntries = collect_hydrate_module_paths(buildOctaneConfig);
		},

		async configResolved(resolvedConfig) {
			root = resolvedConfig.root;
			config = resolvedConfig;
		},

		async resolveId(id, _importer, options) {
			// Browser stub for server-only adapter packages imported from client code.
			if (!options?.ssr && SERVER_ONLY_ADAPTER_IDS.has(id)) {
				return RESOLVED_ADAPTER_BROWSER_STUB_ID;
			}
			if (id === VIRTUAL_HYDRATE_ID) {
				return RESOLVED_VIRTUAL_HYDRATE_ID;
			}
			return null;
		},

		async load(id) {
			if (id === RESOLVED_ADAPTER_BROWSER_STUB_ID) {
				return create_adapter_browser_stub_source();
			}
			if (id === RESOLVED_VIRTUAL_HYDRATE_ID) {
				// Production builds pass the routes' module paths (collected in
				// buildStart) so Rollup bundles them. Dev ALSO needs the literal map —
				// not for chunking (dev serves any module by URL) but for MODULE
				// IDENTITY on a hot server: the codegen's fallback `dynamicImport(path)`
				// is hidden from Vite's import analysis, so it fetches the BARE url
				// while the page's own import chain fetches the analyzed url (`?import`
				// for non-JS extensions, `?t=` stamps after an HMR invalidation). Two
				// urls = two browser module instances — e.g. two app-router singletons,
				// where preHydrate commits matches on one and the page renders the
				// empty other, breaking hydration on every reload until the dev server
				// restarts. Literal `import('/src/…')` entries go through import
				// analysis and share url identity with every other importer.
				let entries = staticEntries;
				if (!isBuild) {
					const loaded = octaneConfig ?? (await loadStartupConfig(root))?.config ?? null;
					entries = collect_hydrate_module_paths(loaded);
				}
				const file = write_project_generated_file(
					config,
					'client-entry.js',
					create_client_entry_source({
						configPath: to_vite_root_import(getOctaneConfigPath(root), root),
						staticEntries: entries,
					}),
				);
				return fs.readFileSync(file, 'utf-8');
			}
			return null;
		},

		/**
		 * Observe the compiler's client output after the pre-transform. A generated
		 * __serverRpc call is an exact, syntax-level signal that this source owns a
		 * `module server`; production uses the collected paths as static SSR imports.
		 */
		transform(code, id, options) {
			if (!isBuild || options?.ssr || !is_octane_module_path(id.split('?')[0])) return null;
			if (!code.includes('_$__serverRpc(')) return null;
			const file = id.split('?')[0];
			const relative = path.relative(root, file);
			const isWithinRoot =
				relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
			serverModuleModules.add(isWithinRoot ? '/' + relative.split(path.sep).join('/') : file);
			return null;
		},

		/**
		 * Dev SSR middleware. Registered as a pre-hook (no return) so it runs
		 * BEFORE Vite's HTML fallback. Config is loaded lazily on first request
		 * (ssrLoadModule isn't ready when configureServer runs).
		 *
		 * @param {ViteDevServer} vite
		 */
		configureServer(vite) {
			if (rendererConfigWatchFiles.size > 0) {
				vite.watcher.add([...rendererConfigWatchFiles]);
			}
			/** @type {Promise<void> | null} */
			let initPromise = null;
			/** @type {number} */
			let lastConfigErrorMtimeMs = 0;

			async function ensureConfigLoaded() {
				if (octaneConfig && router) return;
				if (initPromise) {
					await initPromise;
					return;
				}

				const configPath = getOctaneConfigPath(root);
				if (!octaneConfigExists(root)) return;

				if (lastConfigErrorMtimeMs) {
					try {
						const stat = fs.statSync(configPath);
						if (stat.mtimeMs <= lastConfigErrorMtimeMs) return;
					} catch {
						return;
					}
				}

				let preLoadMtimeMs;
				try {
					preLoadMtimeMs = fs.statSync(configPath).mtimeMs;
				} catch {
					preLoadMtimeMs = 0;
				}

				initPromise = (async () => {
					const nextConfig = await loadOctaneConfig(root, { vite });
					octaneConfig = nextConfig;
					router = has_route_config(nextConfig) ? createRouter(nextConfig.router.routes) : null;
					if (router) {
						console.log(
							`[@octanejs/vite-plugin] Loaded ${nextConfig.router.routes.length} routes from octane.config.ts`,
						);
					}
				})()
					.catch((error) => {
						lastConfigErrorMtimeMs = preLoadMtimeMs;
						throw error;
					})
					.finally(() => {
						initPromise = null;
					});

				await initPromise;
			}

			vite.middlewares.use(function octaneDevMiddleware(req, res, next) {
				(async () => {
					try {
						await ensureConfigLoaded();
					} catch (error) {
						vite.ssrFixStacktrace(/** @type {Error} */ (error));
						console.error('[@octanejs/vite-plugin] Failed to load octane.config.ts:', error);
						next();
						return;
					}

					if (!router || !octaneConfig) {
						next();
						return;
					}

					const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
					const method = req.method || 'GET';

					// RPC requests for `module server` declarations.
					if (is_rpc_request(url.pathname)) {
						await handleRpcRequest(req, res, vite, octaneConfig.server.trustProxy, octaneConfig);
						return;
					}

					const match = router.match(method, url.pathname);
					if (!match) {
						next();
						return;
					}

					// A catch-all RenderRoute ('/*splat') also matches every module /
					// asset / Vite-internal request. Those belong to Vite's transform
					// middleware, not SSR — skip them BEFORE the (per-request) config
					// reload below so module requests stay cheap. ServerRoutes are not
					// filtered: an explicit '/api/data.json' endpoint is legitimate.
					// The file roots let extension-bearing PAGE urls (/docs/v2.0,
					// /users/jane.doe) SSR — only paths naming a real file are Vite's.
					const fileRoots = [config.root];
					if (typeof config.publicDir === 'string' && config.publicDir !== '') {
						fileRoots.push(config.publicDir);
					}
					if (match.route.type === 'render' && isViteOwnedUrl(url, fileRoots)) {
						next();
						return;
					}

					try {
						// Reload config so route edits are picked up (dev HMR for routes).
						const previousRoutes = octaneConfig.router.routes;
						const freshConfig = await loadOctaneConfig(root, { vite });
						if (freshConfig) octaneConfig = freshConfig;
						if (JSON.stringify(previousRoutes) !== JSON.stringify(octaneConfig.router.routes)) {
							console.log(
								`[@octanejs/vite-plugin] Detected route changes. Reloaded ${octaneConfig.router.routes.length} routes`,
							);
						}
						router = createRouter(octaneConfig.router.routes);

						const freshMatch = router.match(method, url.pathname);
						if (!freshMatch) {
							next();
							return;
						}

						const request = nodeRequestToWebRequest(req);
						const context = createContext(request, freshMatch.params);
						const globalMiddlewares = octaneConfig.middlewares;

						let response;
						if (freshMatch.route.type === 'render') {
							response = await runMiddlewareChain(
								context,
								globalMiddlewares,
								freshMatch.route.before || [],
								async () =>
									handleRenderRoute(
										/** @type {RenderRoute} */ (freshMatch.route),
										context,
										vite,
										octaneConfig ?? undefined,
									),
								[],
							);
						} else {
							response = await handleServerRoute(freshMatch.route, context, globalMiddlewares);
						}

						await sendWebResponse(res, response);
					} catch (error) {
						console.error('[@octanejs/vite-plugin] Request error:', error);
						vite.ssrFixStacktrace(/** @type {Error} */ (error));
						res.statusCode = 500;
						res.setHeader('Content-Type', 'text/html');
						res.end(
							`<pre style="color:red;background:#1a1a1a;padding:2rem;margin:0;">${escapeHtml(
								error instanceof Error ? error.stack || error.message : String(error),
							)}</pre>`,
						);
					}
				})().catch((err) => {
					console.error('[@octanejs/vite-plugin] Unhandled middleware error:', err);
					if (!res.headersSent) {
						res.statusCode = 500;
						res.end('Internal Server Error');
					}
				});
			});
		},

		/**
		 * HMR: let self-accepting client modules update normally; otherwise
		 * invalidate the matching SSR modules so the next SSR request recompiles,
		 * and full-reload. (octane has no compile-time CSS cache — styles ride
		 * `injectStyle` calls in the compiled body — so there is no CSS to diff.)
		 */
		hotUpdate: {
			order: 'pre',
			async handler({ file, modules, server }) {
				if (this.environment.name !== 'client') return;
				if (rendererConfigWatchFiles.has(path.resolve(file))) {
					// Renderer rules and boundary metadata are immutable inputs to every
					// compiler environment. Rebuild the plugin/compiler snapshot instead
					// of letting later transforms observe a mixture of old and new config.
					await server.restart();
					return [];
				}
				if (modules.length > 0 && modules.every((m) => m.isSelfAccepting)) return;
				if (!is_octane_module_path(file)) return;

				const ssr = server.environments.ssr;
				if (ssr) {
					const ssrModules = ssr.moduleGraph.getModulesByFile(file);
					if (ssrModules) {
						for (const mod of ssrModules) ssr.moduleGraph.invalidateModule(mod);
					}
				}
				this.environment.hot.send({ type: 'full-reload' });
				return [];
			},
		},

		/**
		 * Production client build: inject the hydrate entry into index.html so
		 * Vite bundles it into the html chunk graph (the built template then
		 * carries the hashed script tag — the production server injects nothing
		 * per-request). `order: 'pre'` is required: Vite's build-html plugin
		 * collects module scripts BEFORE default-order transforms run, so a
		 * post-injected script would ship unbundled. Dev never runs this branch:
		 * the dev middleware injects `/@id/virtual:octane-hydrate` itself.
		 */
		transformIndexHtml: {
			order: 'pre',
			handler(html) {
				if (!isBuild || isSSRBuild || !has_route_config(buildOctaneConfig)) return html;
				return injectHydrationEntry(html, VIRTUAL_HYDRATE_ID, HYDRATION_NONCE_PLACEHOLDER);
			},
		},

		/**
		 * Production: after the client build completes, build the server bundle.
		 * Reads the client manifest into a per-route asset map, generates the
		 * server entry (server/virtual-entry.js), and runs a second Vite build
		 * with `ssr: true` into `{outDir}/server`. The built index.html MOVES
		 * from dist/client to dist/server — it is the SSR template (with
		 * unresolved `<!--ssr-*-->` placeholders), and leaving it in the static
		 * dir would shadow the SSR handler at `/` on filesystem-first platforms.
		 */
		async closeBundle() {
			if (!isBuild || isSSRBuild || !has_route_config(buildOctaneConfig)) return;
			const cfg = /** @type {ResolvedOctaneConfig} */ (buildOctaneConfig);

			console.log('[@octanejs/vite-plugin] Client build done. Building the server bundle…');

			const outDir = cfg.build.outDir;
			const clientOutDir = path.join(root, outDir, 'client');
			const serverOutDir = path.join(root, outDir, 'server');

			// ------------------------------------------------------------------
			// Client manifest → per-route asset map (stylesheet + modulepreload
			// tags the production server emits for the matched route).
			// ------------------------------------------------------------------
			const manifestPath = path.join(clientOutDir, '.vite', 'manifest.json');
			/** @type {Record<string, { file: string, src?: string, css?: string[], imports?: string[], dynamicImports?: string[] }>} */
			let clientManifest = {};
			if (fs.existsSync(manifestPath)) {
				clientManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
			} else {
				console.warn(
					`[@octanejs/vite-plugin] Client manifest not found at ${manifestPath} — per-route asset preloading disabled`,
				);
			}

			const clientAssetMap = createClientAssetMap(clientManifest, staticEntries);

			// The manifest was only needed here; leaving .vite/ in dist/client would
			// publish source file paths through the static server.
			fs.rmSync(path.join(clientOutDir, '.vite'), { recursive: true, force: true });

			// ------------------------------------------------------------------
			// Generate the server entry and build it (ssr: true). The build loads
			// the app's vite.config from `root`, so the octane compiler instance
			// there compiles .tsrx in server mode — do NOT add octane() here.
			// ------------------------------------------------------------------
			const serverEntryFile = write_project_generated_file(
				config,
				'server-entry.js',
				generateServerEntry({
					routes: cfg.router.routes,
					octaneConfigPath: getOctaneConfigPath(root),
					rootBoundary: cfg.rootBoundary,
					rpcModulePaths: [...serverModuleModules],
					clientAssetMap,
					// The virtual entry has no filesystem importer, so resolve app-core
					// from this package before handing source to Vite. This also works
					// when app-core is nested under the plugin by a package manager.
					productionModuleId: requireFromPlugin.resolve('@octanejs/app-core/production'),
					nodeModuleId: requireFromPlugin.resolve('@octanejs/app-core/node'),
				}),
			);

			const VIRTUAL_SERVER_ENTRY_ID = 'virtual:octane-server-entry';
			const RESOLVED_VIRTUAL_SERVER_ENTRY_ID = '\0' + VIRTUAL_SERVER_ENTRY_ID;
			/** @type {Plugin} */
			const virtualEntryPlugin = {
				name: 'octane-virtual-server-entry',
				resolveId(id) {
					if (id === VIRTUAL_SERVER_ENTRY_ID) return RESOLVED_VIRTUAL_SERVER_ENTRY_ID;
				},
				load(id) {
					if (id === RESOLVED_VIRTUAL_SERVER_ENTRY_ID) {
						return fs.readFileSync(serverEntryFile, 'utf-8');
					}
				},
			};

			const { build: viteBuild } = await import('vite');
			await viteBuild({
				root,
				appType: 'custom',
				plugins: [virtualEntryPlugin],
				resolve: {
					alias: [
						// octane.config.ts imports RenderRoute/defineConfig from the BARE
						// package — alias it to the config-surface facade so the bundle
						// carries neither the compiler nor the dev middleware. Subpaths
						// ('/production', '/node') resolve normally and ARE bundled.
						{
							find: /^@octanejs\/vite-plugin$/,
							replacement: fileURLToPath(new URL('./config-entry.js', import.meta.url)),
						},
					],
				},
				build: {
					outDir: serverOutDir,
					emptyOutDir: true,
					ssr: true,
					target: cfg.build.target,
					minify: cfg.build.minify ?? false,
					rollupOptions: {
						input: VIRTUAL_SERVER_ENTRY_ID,
						output: {
							entryFileNames: ENTRY_FILENAME,
							format: 'esm',
						},
					},
				},
				ssr: {
					// Self-contained server bundle: everything except node builtins is
					// bundled, so dist/server deploys without node_modules. 'vite'
					// stays external as a guard — nothing should reach it (the facade
					// alias keeps load-config's dynamic import out of the graph).
					noExternal: true,
					external: ['vite'],
				},
			});

			// The built index.html is the SSR template — move it out of the static
			// client dir (see hook doc above).
			const clientHtml = path.join(clientOutDir, 'index.html');
			if (fs.existsSync(clientHtml)) {
				fs.renameSync(clientHtml, path.join(serverOutDir, 'index.html'));
			}

			console.log(`[@octanejs/vite-plugin] Server build complete: ${path.join(outDir, 'server')}`);
			console.log(
				`[@octanejs/vite-plugin] Start with: node ${outDir}/server/${ENTRY_FILENAME} (or octane-preview)`,
			);

			// ------------------------------------------------------------------
			// Deploy adapter (SvelteKit-style): with both bundles on disk, let the
			// config's adapter restructure them for its platform (e.g.
			// @octanejs/adapter-vercel emits `.vercel/output`).
			// ------------------------------------------------------------------
			if (cfg.adapter?.adapt) {
				const adapterName = cfg.adapter.name ?? 'adapter';
				console.log(`[@octanejs/vite-plugin] Running ${adapterName} adapt()…`);
				await cfg.adapter.adapt({
					root,
					outDir,
					clientDir: clientOutDir,
					serverDir: serverOutDir,
					log: (message) => console.log(message),
				});
			}
		},
	};

	// Forward compiler options. `exclude` lists ad-hoc path fragments the
	// compiler's `.ts`/`.js` hook-slotting pass must skip. Hand-slot-forwarding
	// bindings should not need it: they declare
	// `"octane": { "hookSlots": { "manual": ["src"] } }` in their own package.json and the
	// compiler plugin skips those directories via a nearest-manifest lookup.
	// Other installed raw-source Octane packages are transformed automatically.
	/**
	 * @type {{
	 *   hmr?: boolean,
	 *   profile?: boolean,
	 *   exclude?: string[],
	 *   renderers?: import('@octanejs/app-core').ExperimentalRendererConfigOptions,
	 * }}
	 */
	const compilerOptions = {};
	if (inlineOptions.hmr !== undefined) compilerOptions.hmr = inlineOptions.hmr;
	if (inlineOptions.profile !== undefined) compilerOptions.profile = inlineOptions.profile;
	if (inlineOptions.exclude !== undefined) compilerOptions.exclude = inlineOptions.exclude;
	if (inlineOptions.renderers !== undefined) compilerOptions.renderers = inlineOptions.renderers;
	const compilerPlugin = /** @type {Plugin} */ (octaneCompiler(compilerOptions));
	const compilerConfigHook = compilerPlugin.config;
	if (typeof compilerConfigHook === 'function') {
		compilerPlugin.config = function compilerConfigWithAppRenderers(userConfig, env) {
			const projectRoot = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
			// Inline renderer metadata is an explicit full override. Preserve the
			// synchronous no-config/inline path used by compiler-only SPA projects.
			if (inlineOptions.renderers !== undefined) {
				rendererConfigWatchFiles.clear();
				return compilerConfigHook.call(this, userConfig, env);
			}

			const configPath = getOctaneConfigPath(projectRoot);
			if (!octaneConfigExists(projectRoot)) {
				delete compilerOptions.renderers;
				rendererConfigWatchFiles.clear();
				// A newly-created octane.config.ts can introduce renderer rules. Watch
				// the missing path so dev restarts into the configured compiler.
				rendererConfigWatchFiles.add(path.resolve(configPath));
				return compilerConfigHook.call(this, userConfig, env);
			}

			return loadStartupConfig(projectRoot).then((loaded) => {
				const config = /** @type {LoadedOctaneConfig} */ (loaded);
				compilerOptions.renderers = config.config.compiler.renderers;
				rendererConfigWatchFiles.clear();
				for (const file of [...config.dependencies, ...config.missingDependencies]) {
					rendererConfigWatchFiles.add(path.resolve(file));
				}
				return compilerConfigHook.call(this, userConfig, env);
			});
		};
	}
	// The compiler plugin is untyped JS (its `enforce` infers as `string`).
	return [compilerPlugin, metaPlugin];
}

// Mainly to enforce types / DX.
export function defineConfig(/** @type {OctaneConfigOptions} */ options) {
	return options;
}

// ============================================================================
// Dev-server HTTP helpers — nodeRequestToWebRequest / sendWebResponse live in
// server/node-http.js (shared with the production server + serverless wrapper).
// ============================================================================

/**
 * Handle a dev RPC request for `module server` declarations.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {import('vite').ViteDevServer} vite
 * @param {boolean} trustProxy
 * @param {OctaneConfigOptions | null} config
 */
async function handleRpcRequest(req, res, vite, trustProxy, config) {
	try {
		const webRequest = nodeRequestToWebRequest(req);
		const asyncContext = getDevAsyncContext(config);

		const response = await handle_rpc_request(webRequest, {
			async resolveFunction(hash) {
				const rpcModules = /** @type {any} */ (globalThis).rpc_modules;
				if (!rpcModules) return null;
				const moduleInfo = rpcModules.get(hash);
				if (!moduleInfo) return null;
				const [filePath, funcName] = moduleInfo;
				const module = await vite.ssrLoadModule(filePath);
				const server = module._$_server_$_;
				if (!server || !server[funcName]) return null;
				return server[funcName];
			},
			async executeServerFunction(fn, body) {
				const { executeServerFunction } = await vite.ssrLoadModule('octane/server');
				return executeServerFunction(fn, body);
			},
			asyncContext,
			trustProxy,
		});

		await sendWebResponse(res, response);
	} catch (error) {
		console.error('[@octanejs/vite-plugin] RPC error:', error);
		res.statusCode = 500;
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'RPC failed' }));
	}
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
