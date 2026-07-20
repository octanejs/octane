/**
 * Standalone Vite plugin for Octane DevTools — the canonical dev-server
 * wiring: it serves the `virtual:octane-devtools` panel entry, injects it
 * into every dev HTML response, and exposes the `/__octane_devtools/snapshot`
 * relay that external tools (the `@octanejs/mcp-server`
 * `octane_devtools_snapshot` tool, curl, CI checks) read as JSON.
 *
 * Compile-time instrumentation stays where compilation lives: the octane
 * compiler plugin must run with `devtools: true` so the reserved
 * `__OCTANE_DEVTOOLS_ENABLED__` define and profiling metadata are emitted —
 * this plugin warns when that half is missing. `@octanejs/vite-plugin`
 * composes both automatically from its own `devtools: true`; compiler-only
 * apps add this plugin themselves:
 *
 *   import { octane } from 'octane/compiler/vite';
 *   import { octaneDevtools } from '@octanejs/devtools/vite';
 *   plugins: [octane({ devtools: true }), octaneDevtools()]
 *
 * The plugin is `apply: 'serve'`, so builds never see it.
 */

export const VIRTUAL_DEVTOOLS_ID = 'virtual:octane-devtools';
export const RESOLVED_VIRTUAL_DEVTOOLS_ID = '\0virtual:octane-devtools';

export const DEVTOOLS_SNAPSHOT_PATH = '/__octane_devtools/snapshot';
const SNAPSHOT_REQUEST_EVENT = 'octane:devtools:snapshot-request';
const SNAPSHOT_RESPONSE_EVENT = 'octane:devtools:snapshot-response';
const SNAPSHOT_TIMEOUT_MS = 5000;
const DEVTOOLS_DEFINE = '__OCTANE_DEVTOOLS_ENABLED__';

/** The dev-only client entry behind `virtual:octane-devtools`. */
export function create_devtools_entry_source() {
	return `// Octane devtools dev entry (virtual:octane-devtools) — serve-mode only.
let modPromise = null;
const load = () =>
	(modPromise ??= import('@octanejs/devtools').catch((error) => {
		console.warn(
			'[@octanejs/devtools] devtools is enabled but the package could not be loaded. ' +
				'Install @octanejs/devtools as a dev dependency to get the in-page panel.',
			error,
		);
		return null;
	}));
// The panel module graph is meaningful but not urgent: mount off the critical
// path so app startup/hydration wins the main thread on every dev reload. The
// idempotent mount tolerates double injection.
const mountWhenIdle = () =>
	load().then((mod) => {
		if (mod !== null) (mod.mountOctaneDevtools ?? mod.mountDevtoolsPanel)();
	});
if (typeof requestIdleCallback === 'function') requestIdleCallback(mountWhenIdle);
else setTimeout(mountWhenIdle, 0);
if (import.meta.hot) {
	import.meta.hot.on(${JSON.stringify(SNAPSHOT_REQUEST_EVENT)}, (payload) => {
		const id = payload && payload.id;
		load().then(async (mod) => {
			let snapshot = null;
			let error = null;
			if (mod === null) {
				error = '@octanejs/devtools is not installed in this app.';
			} else {
				// A freshly-loaded page may not have attached the bridge yet — wait
				// briefly instead of racing an error back to the relay.
				const hook = await mod.waitForDevtoolsHook(3000).catch(() => null);
				if (hook === null) {
					error = 'The Octane devtools bridge is not attached in this page.';
				} else {
					try {
						const options = (payload && payload.options) || {};
						if (options.excludeFilePrefixes === undefined && mod.getPanelSourcePrefix) {
							const prefix = mod.getPanelSourcePrefix(hook);
							if (prefix !== null) options.excludeFilePrefixes = [prefix];
						}
						snapshot = mod.buildSnapshot(hook, options);
					} catch (err) {
						error = String((err && err.message) || err);
					}
				}
			}
			import.meta.hot.send(${JSON.stringify(SNAPSHOT_RESPONSE_EVENT)}, { id, snapshot, error });
		});
	});
}
`;
}

/**
 * @param {import('vite').ViteDevServer} vite
 * @param {number} [timeoutMs]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void}
 */
export function create_devtools_snapshot_middleware(vite, timeoutMs = SNAPSHOT_TIMEOUT_MS) {
	let nextRequestId = 1;
	return function octaneDevtoolsSnapshotMiddleware(req, res) {
		/** @type {(status: number, body: unknown) => void} */
		const respond = (status, body) => {
			res.statusCode = status;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify(body));
		};
		if (req.method !== 'GET') {
			respond(405, { error: 'Use GET.' });
			return;
		}
		// `vite.ws` remains the stable custom-event channel; prefer the client
		// environment's hot channel when the environments API exposes one.
		const hot = vite.environments?.client?.hot ?? vite.ws;
		if (hot == null) {
			respond(503, { error: 'The dev server websocket channel is unavailable.' });
			return;
		}
		const url = new URL(req.url || '/', 'http://localhost');
		/** @type {Record<string, unknown>} */
		const options = {};
		if (url.searchParams.get('includeState') === 'false') options.includeState = false;
		const maxDetailedNodes = Number(url.searchParams.get('maxDetailedNodes'));
		if (Number.isInteger(maxDetailedNodes) && maxDetailedNodes > 0) {
			options.maxDetailedNodes = maxDetailedNodes;
		}
		const eventLimit = Number(url.searchParams.get('eventLimit'));
		if (Number.isInteger(eventLimit) && eventLimit >= 0) options.eventLimit = eventLimit;

		const id = nextRequestId++;
		let settled = false;
		/** @type {string | null} */
		let firstError = null;
		/** @type {ReturnType<typeof setTimeout>} */
		let timer;
		/** @type {(payload: { id?: number, snapshot?: unknown, error?: string } | undefined) => void} */
		const onResponse = (payload) => {
			if (settled || payload == null || payload.id !== id) return;
			// The request broadcasts to every connected page, and a page without an
			// Octane root answers with an error — hold errors and keep waiting for
			// a success until the deadline, so a healthy tab always wins the race.
			if (typeof payload.error === 'string' && payload.error !== '') {
				firstError ??= payload.error;
				return;
			}
			settled = true;
			clearTimeout(timer);
			hot.off?.(SNAPSHOT_RESPONSE_EVENT, onResponse);
			respond(200, payload.snapshot ?? null);
		};
		timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			hot.off?.(SNAPSHOT_RESPONSE_EVENT, onResponse);
			if (firstError !== null) {
				respond(502, { error: firstError });
			} else {
				respond(504, {
					error:
						'No connected browser answered the snapshot request. Open the app in a browser ' +
						'against this dev server (with devtools enabled) and retry.',
				});
			}
		}, timeoutMs);
		hot.on(SNAPSHOT_RESPONSE_EVENT, onResponse);
		hot.send(SNAPSHOT_REQUEST_EVENT, { id, options });
	};
}

/**
 * The standalone Octane DevTools dev-server plugin.
 *
 * @returns {import('vite').Plugin}
 */
export function octaneDevtools() {
	return {
		name: '@octanejs/devtools',
		apply: 'serve',
		configResolved(config) {
			// The compile half lives in the octane compiler plugin; a missing or
			// false reserved define means the runtime bridge will never attach.
			const define = config.define?.[DEVTOOLS_DEFINE];
			if (define !== true && define !== 'true') {
				(config.logger ?? console).warn(
					'[@octanejs/devtools] the octane compiler is not emitting devtools instrumentation — ' +
						'pass `devtools: true` to the octane() compiler plugin so the panel has a bridge to attach to.',
				);
			}
		},
		resolveId(id) {
			if (id === VIRTUAL_DEVTOOLS_ID) return RESOLVED_VIRTUAL_DEVTOOLS_ID;
			return null;
		},
		load(id) {
			if (id === RESOLVED_VIRTUAL_DEVTOOLS_ID) return create_devtools_entry_source();
			return null;
		},
		transformIndexHtml: {
			order: 'pre',
			handler(html) {
				// `apply: 'serve'` already excludes builds; every dev HTML response —
				// Vite's own SPA middleware or a framework's explicit
				// `vite.transformIndexHtml` call — gets the panel entry.
				return {
					html,
					tags: [
						{
							tag: 'script',
							attrs: { type: 'module', src: `/@id/${VIRTUAL_DEVTOOLS_ID}` },
							injectTo: 'body',
						},
					],
				};
			},
		},
		configureServer(vite) {
			vite.middlewares.use(DEVTOOLS_SNAPSHOT_PATH, create_devtools_snapshot_middleware(vite));
		},
	};
}
