import type { Plugin, BuildEnvironmentOptions, ViteDevServer } from 'vite';
import type { RuntimePrimitives } from '@ripple-ts/adapter';

// ============================================================================
// Plugin exports
// ============================================================================

export interface OctanePluginOptions {
	/** Override the client HMR default (on in serve mode, off for SSR). */
	hmr?: boolean;
	/**
	 * Path fragments the compiler's plain `.ts`/`.js` hook-slotting pass must
	 * skip — hand-slot-forwarding library sources that would otherwise be
	 * double-slotted. Prefer declaring package-relative manual directories in
	 * the library manifest as `octane.hookSlots.manual`; that contract works for
	 * both installed raw source and monorepo links. This option remains an
	 * escape hatch for sources whose manifest cannot carry that declaration.
	 */
	exclude?: string[];
}

/**
 * The octane metaframework plugin. Returns an array:
 * `[octane(), metaPlugin]` — the first compiles `.tsrx`, the second owns
 * config / routing / dev SSR / hydrate.
 */
export function octane(options?: OctanePluginOptions): Plugin[];

/**
 * Is this a request the Vite dev server owns (module / asset / internal
 * namespace / transform query), as opposed to a page navigation? The dev SSR
 * middleware uses it so a catch-all RenderRoute never swallows Vite requests.
 *
 * `fileRoots` (the Vite root + publicDir) gate the file-extension heuristic:
 * an extension-bearing path is only Vite's when it names a real file under
 * one of them, so page URLs like `/docs/v2.0` still SSR. Without `fileRoots`
 * any extension counts (conservative).
 */
export function isViteOwnedUrl(url: URL, fileRoots?: string[]): boolean;
export function defineConfig(options: OctaneConfigOptions): OctaneConfigOptions;
/** Context.state key for a per-request CSP nonce set by middleware. */
export const OCTANE_NONCE_STATE_KEY: 'octane.nonce';
export function resolveOctaneConfig(
	raw: OctaneConfigOptions,
	options?: { requireAdapter?: boolean },
): ResolvedOctaneConfig;
export function getOctaneConfigPath(projectRoot: string): string;
export function octaneConfigExists(projectRoot: string): boolean;
export function loadOctaneConfig(
	projectRoot: string,
	options?: { vite?: ViteDevServer; requireAdapter?: boolean },
): Promise<ResolvedOctaneConfig>;

// ============================================================================
// Route classes
// ============================================================================

export class RenderRoute {
	readonly type: 'render';
	path: string;
	entry: RenderRouteEntry;
	layout?: string;
	before: Middleware[];
	status?: number;
	constructor(options: RenderRouteOptions);
}

export class ServerRoute {
	readonly type: 'server';
	path: string;
	methods: string[];
	handler: RouteHandler;
	before: Middleware[];
	after: Middleware[];
	constructor(options: ServerRouteOptions);
}

export type Route = RenderRoute | ServerRoute;

// ============================================================================
// Route options
// ============================================================================

export interface RenderRouteOptions {
	/** URL path pattern (e.g., '/', '/posts/:id', '/docs/*slug') */
	path: string;
	/** Path to the component entry file, optionally with a preferred named export */
	entry: RenderRouteEntry;
	/** Path to the layout component (wraps the entry) */
	layout?: string;
	/** Middleware to run before rendering */
	before?: Middleware[];
	/**
	 * HTTP status for the rendered response (default 200). Set 404 on a
	 * catch-all route so the SSR'd not-found page reports its real status.
	 */
	status?: number;
}

export interface ServerRouteOptions {
	/** URL path pattern (e.g., '/api/hello', '/api/posts/:id') */
	path: string;
	/** HTTP methods to handle (default: ['GET']) */
	methods?: string[];
	/** Request handler that returns a Response */
	handler: RouteHandler;
	/** Middleware to run before the handler */
	before?: Middleware[];
	/** Middleware to run after the handler */
	after?: Middleware[];
}

// ============================================================================
// Context and middleware
// ============================================================================

export interface Context {
	/** The incoming Request object */
	request: Request;
	/** URL parameters extracted from the route pattern */
	params: Record<string, string>;
	/** Parsed URL object */
	url: URL;
	/**
	 * Shared state for passing data between middlewares. Set
	 * `OCTANE_NONCE_STATE_KEY` (`'octane.nonce'`) to a non-empty string to nonce
	 * renderer inline scripts, hydration data, and the hydrate module script.
	 */
	state: Map<string, unknown>;
}

export type NextFunction = () => Promise<Response>;
export type Middleware = (context: Context, next: NextFunction) => Response | Promise<Response>;
export type RouteHandler = (context: Context) => Response | Promise<Response>;

// ============================================================================
// Configuration
// ============================================================================

export type Component<T = Record<string, any>> = (
	props: T,
	scope: any,
	extra?: any,
) => string | void;

export type RenderRouteEntry = string | readonly [exportName: string, path: string];

/**
 * Props every RenderRoute component (and layout) receives: the route params
 * and the request `url` (pathname + search, origin-free — the client hydrate
 * entry re-renders with the identical string).
 */
export interface RenderRouteProps {
	params: Record<string, string>;
	url: string;
	/**
	 * Request-scoped middleware state on the server. This Map is intentionally
	 * absent during browser hydration and is never serialized.
	 */
	state?: Map<string, unknown>;
}

/**
 * The app hook run by the client hydrate entry BEFORE `hydrateRoot` (config
 * `router.preHydrate`): commit client-side state the server already resolved —
 * typically a client router loading its match tree — so the first hydration
 * pass adopts the same tree the server rendered.
 */
export type PreHydrateHook = (info: {
	url: string;
	params: Record<string, string>;
}) => void | Promise<void>;

export interface RootBoundaryOptions {
	/** Component entry rendered while the root route tree is suspended. */
	pending?: RenderRouteEntry;
	/** Component entry rendered when an uncaught root render/effect error reaches the boundary. */
	catch?: RenderRouteEntry;
}

export interface OctaneConfigOptions {
	build?: {
		/** Output directory for the production build. @default 'dist' */
		outDir?: string;
		minify?: boolean;
		target?: BuildEnvironmentOptions['target'];
	};
	adapter?: OctaneAdapter;
	router?: {
		routes: Route[];
		/**
		 * Vite-root path (e.g. '/src/pre-hydrate.ts') of a module whose default
		 * export is a {@link PreHydrateHook}. The client hydrate entry imports it
		 * and awaits the hook before calling `hydrateRoot`.
		 */
		preHydrate?: string;
	};
	/**
	 * Global root pending/catch component entries used by client and SSR roots.
	 * Paths use Vite-root syntax (for example `/src/Pending.tsrx`); a tuple
	 * selects a named export.
	 */
	rootBoundary?: RootBoundaryOptions;
	/** Global middlewares applied to all routes */
	middlewares?: Middleware[];
	platform?: {
		env: Record<string, string>;
	};
	server?: {
		/**
		 * Trust `X-Forwarded-Proto` / `X-Forwarded-Host` when deriving the
		 * request origin. Enable only behind a trusted reverse proxy.
		 * @default false
		 */
		trustProxy?: boolean;
		/**
		 * Production SSR mode: 'streaming' (default) flushes the shell at
		 * first await and streams suspense segments out-of-order (same engine
		 * as dev SSR); 'buffered' awaits everything (`prerender`) and sends
		 * one document — for hosts that break streamed responses.
		 * @default 'streaming'
		 */
		render?: 'streaming' | 'buffered';
	};
}

/**
 * Resolved configuration with all defaults applied.
 */
export interface ResolvedOctaneConfig {
	build: {
		/** @default 'dist' */
		outDir: string;
		minify?: boolean;
		target?: BuildEnvironmentOptions['target'];
	};
	adapter?: OctaneAdapter;
	router: {
		routes: Route[];
		preHydrate?: string;
	};
	rootBoundary: RootBoundaryOptions;
	/** @default [] */
	middlewares: Middleware[];
	platform: {
		/** @default {} */
		env: Record<string, string>;
	};
	server: {
		/** @default false */
		trustProxy: boolean;
		/** @default 'streaming' */
		render: 'streaming' | 'buffered';
	};
}

/**
 * The build context @octanejs/vite-plugin passes to an adapter's `adapt()`
 * after `vite build` produced both bundles.
 */
export interface AdaptContext {
	/** Absolute project root (the Vite root). */
	root: string;
	/** The config `build.outDir` (relative to root, e.g. 'dist'). */
	outDir: string;
	/** Absolute path of the static client bundle ({outDir}/client). */
	clientDir: string;
	/** Absolute path of the server bundle ({outDir}/server, contains entry.js). */
	serverDir: string;
	/** Prefixed build logger. */
	log: (message: string) => void;
}

/**
 * The octane.config.ts `adapter` contract. All parts are optional and
 * independent:
 *
 * - `adapt(ctx)` — post-build hook: restructure dist/client + dist/server for
 *   a deployment target (e.g. @octanejs/adapter-vercel emits `.vercel/output`).
 * - `serve(handler, opts)` — replaces the generated server entry's built-in
 *   Node boot when running `node dist/server/entry.js` / `octane-preview`.
 * - `runtime` — platform primitives (hashing, async context) replacing the
 *   entry's Node defaults; needed on non-Node runtimes.
 */
export interface OctaneAdapter {
	name?: string;
	adapt?: (ctx: AdaptContext) => void | Promise<void>;
	serve?: AdapterServeFunction;
	runtime?: RuntimePrimitives;
}

export type AdapterServeFunction = (
	handler: (request: Request, platform?: unknown) => Response | Promise<Response>,
	options?: Record<string, unknown>,
) => { listen: (port?: number) => unknown; close: () => void };
