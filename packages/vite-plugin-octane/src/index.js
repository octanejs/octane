/** @import {Plugin, ResolvedConfig, ViteDevServer, UserConfig} from 'vite' */
/** @import {OctaneConfigOptions, ResolvedOctaneConfig, RenderRoute} from '@octanejs/vite-plugin' */

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AsyncLocalStorage } from 'node:async_hooks';

import { octane as octaneCompiler } from 'octane/compiler/vite';

import { createRouter } from './server/router.js';
import { createContext, runMiddlewareChain } from './server/middleware.js';
import { handleRenderRoute } from './server/render-route.js';
import { handleServerRoute } from './server/server-route.js';
import {
	getOctaneConfigPath,
	loadOctaneConfig,
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

import { patch_global_fetch, is_rpc_request, handle_rpc_request } from '@ripple-ts/adapter/rpc';

// Re-export route classes + config helpers (public API surface).
export { RenderRoute, ServerRoute } from './routes.js';
export {
	getOctaneConfigPath,
	loadOctaneConfig,
	resolveOctaneConfig,
	octaneConfigExists,
} from './load-config.js';

const VIRTUAL_HYDRATE_ID = 'virtual:octane-hydrate';
const RESOLVED_VIRTUAL_HYDRATE_ID = '\0virtual:octane-hydrate';
const OCTANE_EXTENSIONS = ['.tsrx'];

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
 * The octane metaframework Vite plugin.
 *
 * Returns an ARRAY: `[octaneCompiler({ hmr }), metaPlugin]`. The first element is
 * octane/compiler's transform plugin — it owns ALL `.tsrx` compilation, picking
 * client vs server mode per-module from Vite's SSR signal (so the SAME file
 * compiles to a DOM-clone client body for the browser and to an HTML-building
 * server body when pulled via `ssrLoadModule`). The metaPlugin owns config,
 * routing, dev SSR, the client hydrate virtual module, and dev RPC.
 *
 * PHASE 1 = dev SSR + routing + hydrate. Production build (buildStart /
 * closeBundle / transformIndexHtml / server-entry / adapter.serve) is Phase 2.
 *
 * @param {{ hmr?: boolean, exclude?: string[] }} [inlineOptions]
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

	/** @type {Plugin} */
	const metaPlugin = {
		name: '@octanejs/vite-plugin',

		/**
		 * @param {UserConfig} userConfig
		 * @param {{ command: string, isPreview?: boolean }} env
		 */
		config(userConfig, env) {
			const exclude = userConfig.optimizeDeps?.exclude || [];
			return {
				// Dev SSR owns routing, so default appType to 'custom' (no SPA HTML
				// fallback masking SSR routes). Respect an explicit user appType, and
				// leave `vite preview` alone: production SSR serving is Phase 2, so
				// preview must keep Vite's own SPA fallback to serve the client build.
				...(userConfig.appType === undefined && !env?.isPreview ? { appType: 'custom' } : {}),
				optimizeDeps: {
					exclude: [
						// `@octanejs/query` ships a `.tsrx` provider component, so it must NOT
						// be esbuild-prebundled — the octane transform owns `.tsrx` compilation.
						...new Set([
							...exclude,
							'octane',
							'octane/compiler',
							'@octanejs/query',
							...SERVER_ONLY_ADAPTER_IDS,
						]),
					],
				},
				// Workspace packages with TS source must be transformed by Vite's SSR
				// pipeline (not require()'d raw) so ssrLoadModule gets transpiled code.
				ssr: {
					noExternal: ['octane', 'octane/compiler', '@octanejs/query'],
				},
			};
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
				// Dev: dynamic import() of the route entry works through Vite, so the
				// static import map is left empty (the codegen falls back to a dynamic
				// import per entry). The production static map is Phase 2.
				const file = write_project_generated_file(
					config,
					'client-entry.js',
					create_client_entry_source({
						configPath: to_vite_root_import(getOctaneConfigPath(root), root),
						staticEntries: [],
					}),
				);
				return fs.readFileSync(file, 'utf-8');
			}
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
	};

	// Forward compiler options. `exclude` lists path fragments the compiler's
	// `.ts`/`.js` hook-slotting pass must skip — hand-slot-forwarding library
	// sources that would otherwise be double-slotted. Published bindings live in
	// node_modules and are skipped automatically; this matters for monorepo /
	// aliased-to-source setups where pnpm symlinks resolve @octanejs/* imports
	// to `packages/*/src` paths.
	const compilerOptions = {};
	if (inlineOptions.hmr !== undefined) compilerOptions.hmr = inlineOptions.hmr;
	if (inlineOptions.exclude !== undefined) compilerOptions.exclude = inlineOptions.exclude;
	return [octaneCompiler(compilerOptions), metaPlugin];
}

// Mainly to enforce types / DX.
export function defineConfig(/** @type {OctaneConfigOptions} */ options) {
	return options;
}

// ============================================================================
// Dev-server HTTP helpers
// ============================================================================

/**
 * Convert a Node.js IncomingMessage to a Web Request.
 * @param {import('node:http').IncomingMessage} nodeRequest
 * @returns {Request}
 */
function nodeRequestToWebRequest(nodeRequest) {
	const host = nodeRequest.headers.host || 'localhost';
	const url = new URL(nodeRequest.url || '/', `http://${host}`);

	const headers = new Headers();
	for (const [key, value] of Object.entries(nodeRequest.headers)) {
		if (value == null) continue;
		if (Array.isArray(value)) {
			for (const v of value) headers.append(key, v);
		} else {
			headers.set(key, value);
		}
	}

	const method = (nodeRequest.method || 'GET').toUpperCase();
	/** @type {RequestInit & { duplex?: 'half' }} */
	const init = { method, headers };
	if (method !== 'GET' && method !== 'HEAD') {
		init.body = Readable.toWeb(nodeRequest);
		init.duplex = 'half';
	}
	return new Request(url, init);
}

/**
 * Pipe a Web Response to a Node.js ServerResponse.
 * @param {import('node:http').ServerResponse} nodeResponse
 * @param {Response} webResponse
 */
async function sendWebResponse(nodeResponse, webResponse) {
	nodeResponse.statusCode = webResponse.status;
	if (webResponse.statusText) nodeResponse.statusMessage = webResponse.statusText;
	webResponse.headers.forEach((value, key) => {
		nodeResponse.setHeader(key, value);
	});
	if (webResponse.body) {
		const reader = webResponse.body.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				nodeResponse.write(value);
			}
		} finally {
			reader.releaseLock();
		}
	}
	nodeResponse.end();
}

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
				const rpcModules = globalThis.rpc_modules;
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
