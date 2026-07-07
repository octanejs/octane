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
	 * double-slotted. Published bindings live in node_modules and are skipped
	 * automatically; set this for monorepo / aliased-to-source setups where
	 * pnpm symlinks resolve `@octanejs/*` imports to `packages/*\/src` paths
	 * (e.g. `['/packages/router/src/']`).
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
	/** Shared state for passing data between middlewares */
	state: Map<string, unknown>;
}

export type NextFunction = () => Promise<Response>;
export type Middleware = (context: Context, next: NextFunction) => Response | Promise<Response>;
export type RouteHandler = (context: Context) => Response | Promise<Response>;

// ============================================================================
// Configuration
// ============================================================================

export type Component<T = Record<string, any>> = (
	scope: any,
	props: T,
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
	pending?: Component<Record<string, never>>;
	catch?: Component<{ error: unknown; reset: () => void }>;
}

export interface OctaneConfigOptions {
	build?: {
		/** Output directory for the production build. @default 'dist' */
		outDir?: string;
		minify?: boolean;
		target?: BuildEnvironmentOptions['target'];
	};
	adapter?: {
		serve: AdapterServeFunction;
		/**
		 * Platform-specific runtime primitives provided by the adapter.
		 * Required for production builds; in development the plugin falls back
		 * to Node.js defaults if not provided.
		 */
		runtime: RuntimePrimitives;
	};
	router?: {
		routes: Route[];
		/**
		 * Vite-root path (e.g. '/src/pre-hydrate.ts') of a module whose default
		 * export is a {@link PreHydrateHook}. The client hydrate entry imports it
		 * and awaits the hook before calling `hydrateRoot`.
		 */
		preHydrate?: string;
	};
	/** Global root pending/catch UI used by client and SSR render roots */
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
	adapter?: {
		serve: AdapterServeFunction;
		runtime: RuntimePrimitives;
	};
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
	};
}

export type AdapterServeFunction = (
	handler: (request: Request, platform?: unknown) => Response | Promise<Response>,
	options?: Record<string, unknown>,
) => { listen: (port?: number) => unknown; close: () => void };
