import type { RuntimePrimitives } from '@ripple-ts/adapter';
import type { AsyncContext } from '@ripple-ts/adapter/rpc';

// ============================================================================
// Shared app/config exports
// ============================================================================

export function defineConfig(options: OctaneConfigOptions): OctaneConfigOptions;
/** Context.state key for a per-request CSP nonce set by middleware. */
export const OCTANE_NONCE_STATE_KEY: 'octane.nonce';
export const DEFAULT_OUTDIR: 'dist';
export const ENTRY_FILENAME: 'entry.js';
export function resolveOctaneConfig(
	raw: OctaneConfigOptions | ResolvedOctaneConfig,
	options?: { requireAdapter?: boolean },
): ResolvedOctaneConfig;

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

export interface RouteMatch {
	route: Route;
	params: Record<string, string>;
}

export interface Router {
	match(method: string, pathname: string): RouteMatch | null;
}

export function createRouter(routes: Route[]): Router;
export function get_route_entry_path(entry?: RenderRouteEntry): string | undefined;
export function get_route_entry_export_name(entry?: RenderRouteEntry): string | undefined;
export function get_route_entry_id(entry?: RenderRouteEntry): string | undefined;
export function get_component_export(
	module: Record<string, unknown>,
	exportName?: string,
): Function | null;

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
	/** Request-scoped bindings supplied by the active platform integration. */
	platform?: unknown;
	/**
	 * The `module server` export this request targets, present only on an RPC
	 * request. Set before the middleware chain runs, so a policy can authorize
	 * per function instead of per endpoint.
	 */
	rpc?: RpcTarget;
}

/**
 * Identifies the `module server` export an RPC request targets.
 *
 * `module` and `export` are `null` when the integration supplies no
 * {@link RpcRequestOptions.describeFunction}. A policy that matches on them then
 * matches nothing and allows the request, so an integration that hand-rolls the
 * RPC boundary must supply it before writing per-function authorization. Both
 * first-party integrations (the Vite plugin and the production handler) do.
 */
export interface RpcTarget {
	/**
	 * Compiler-assigned function id, taken from the request path. Stable only for
	 * a given build: it is a hash of the declaring module and export name, so it
	 * changes on rename. Authorize on `module`/`export`, not on this.
	 */
	id: string;
	/** Module that declared the export, or `null` when the integration cannot name it. */
	module: string | null;
	/** Exported function name, or `null` when the integration cannot name it. */
	export: string | null;
}

export type NextFunction = () => Promise<Response>;
export type Middleware = (context: Context, next: NextFunction) => Response | Promise<Response>;
export type RouteHandler = (context: Context) => Response | Promise<Response>;

export function compose(
	middlewares: Middleware[],
): (context: Context, finalHandler: () => Promise<Response>) => Promise<Response>;
export function createContext(
	request: Request,
	params: Record<string, string>,
	platform?: unknown,
): Context;
export function runMiddlewareChain(
	context: Context,
	globalMiddlewares: Middleware[],
	beforeMiddlewares: Middleware[],
	handler: () => Promise<Response>,
	afterMiddlewares?: Middleware[],
): Promise<Response>;
export function handleServerRoute(
	route: ServerRoute,
	context: Context,
	globalMiddlewares: Middleware[],
): Promise<Response>;
export function is_rpc_request(pathname: string): boolean;

/** Security policy and execution dependencies for a server-function request. */
export interface RpcRequestOptions {
	resolveFunction: (hash: string) => Function | null | Promise<Function | null>;
	/**
	 * Name the export a function id refers to, without loading its module. Called
	 * once per RPC request, before middleware, to populate {@link Context.rpc}.
	 * Synchronous by contract: both first-party integrations already hold the
	 * mapping, and the middleware chain must not wait on it.
	 */
	describeFunction?: (hash: string) => { module: string; export: string } | null;
	executeServerFunction: (fn: Function, body: string) => Promise<string>;
	asyncContext: AsyncContext<{ origin?: string; platform?: unknown; context?: Context }>;
	trustProxy?: boolean;
	middlewares?: Middleware[];
	allowedOrigins?: readonly string[];
	maxBodyBytes?: number;
	platform?: unknown;
}

/** Apply Octane's security policy and global middleware to a server function. */
export function handleRpcRequest(request: Request, options: RpcRequestOptions): Promise<Response>;

/**
 * The `Context` for the in-flight request.
 *
 * Available inside a `module server` function and inside the middleware chain
 * that runs it, so a server function can read the identity its middleware
 * established rather than trusting an argument the browser supplied. It is the
 * same `Context` instance the middleware saw, including `state` mutations.
 *
 * `context.request.body` is already consumed on the RPC path (the boundary
 * reads it under the configured size limit before dispatching), so
 * `bodyUsed` is `true`; headers, cookies, and `url` are unaffected.
 *
 * Throws outside a request. Use {@link tryGetRequestContext} in code that must
 * also run outside one.
 */
export function getRequestContext(): Context;

/** {@link getRequestContext}, returning `null` outside a request instead of throwing. */
export function tryGetRequestContext(): Context | null;

/**
 * The `globalThis.rpc_modules` registry compiled `module server` declarations
 * register into, guarding against an id collision.
 *
 * An id is a truncated hash of the module path and export name, so two exports
 * can produce the same one. A plain Map would resolve that by overwriting, which
 * makes one function unreachable and routes its calls to the other. This throws
 * instead. Re-registering the same export is a no-op, which module reloads rely
 * on.
 */
export function createRpcRegistry(): Map<string, [modulePath: string, exportName: string]>;

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

/**
 * @experimental Universal renderer configuration is an internal-first API and
 * may change while the first non-DOM renderer is validated.
 */
export interface ExperimentalRendererRuleOptions {
	/** Glob or globs matched against canonical project-relative module IDs. */
	include: string | readonly string[];
	/** Optional glob or globs that remove files from this rule. */
	exclude?: string | readonly string[];
	/** Renderer alias declared in `registry`, or the built-in `dom` alias. */
	renderer: string;
}

/** @experimental Static source restrictions enforced for a renderer. */
export interface ExperimentalRendererValidationOptions {
	/** Host elements that may directly contain authored primitive text. */
	textParents?: readonly string[];
	/** Unbound JavaScript globals that renderer-owned source may not reference. */
	forbiddenGlobals?: readonly string[];
	/** Package IDs whose static imports, subpaths, and CommonJS requires are forbidden. */
	forbiddenImports?: readonly string[];
	/** Allowed static JSX attributes by host name; `*` supplies shared patterns. */
	hostProps?: Readonly<Record<string, readonly string[]>>;
}

/**
 * @experimental A string selects the universal compiler target. The object
 * form carries explicit target metadata for normalized configs and future
 * renderer integrations. The `dom` alias itself is reserved by Octane.
 */
export type ExperimentalRendererRegistryEntry =
	| string
	| {
			module: string;
			target?: 'dom' | 'universal';
			/** Explicit server policy; universal renderers currently support client-only or unsupported. */
			server?: 'render' | 'client-only' | 'unsupported';
			/** JSX import-source module used for file-local intrinsic element types. */
			intrinsics?: string;
			/** Policy for authored text children. @default 'reject' */
			text?: 'reject' | 'ignore' | 'host';
			/** Serializable feature flags consumed by compiler and runtime integrations. */
			capabilities?: readonly string[];
			/** Optional source restrictions enforced when compiling for this renderer. */
			validation?: ExperimentalRendererValidationOptions;
	  };

/**
 * @experimental Static metadata for a component prop whose contents are owned
 * by another renderer. Boundary declarations are keyed by the component's
 * public module ID and export name in {@link ExperimentalRendererConfigOptions}.
 */
export interface ExperimentalRendererBoundaryOptions {
	/** Renderer that owns the boundary component itself. */
	ownerRenderer: string;
	/** Renderer used to lower and execute the declared child region. */
	childRenderer: string;
	/** Component prop containing the renderer-owned region, usually `children`. */
	prop: string;
	/** Omit a client-only child region from server output. */
	server?: 'omit-child';
}

/** @experimental See {@link ExperimentalRendererRuleOptions}. */
export interface ExperimentalRendererConfigOptions {
	/** Renderer aliases mapped to package/project-root module IDs or explicit descriptors. */
	registry?: Record<string, ExperimentalRendererRegistryEntry>;
	/**
	 * Boundary metadata keyed first by stable package/project-root module ID,
	 * then by the component's export name (`default` for a default export).
	 */
	boundaries?: Readonly<
		Record<string, Readonly<Record<string, ExperimentalRendererBoundaryOptions>>>
	>;
	/** Renderer used when no rule matches. @default 'dom' */
	default?: string;
	/** Ordered filename rules. The first matching rule wins. */
	rules?: readonly ExperimentalRendererRuleOptions[];
}

/** @experimental Canonical form used by compiler integrations and cache keys. */
export interface ExperimentalResolvedRendererRule {
	readonly include: readonly string[];
	readonly exclude: readonly string[];
	readonly renderer: string;
}

/** @experimental Canonical form used by compiler integrations and cache keys. */
export interface ExperimentalResolvedRendererRegistryEntry {
	readonly module: string;
	readonly target: 'dom' | 'universal';
	readonly server: 'render' | 'client-only' | 'unsupported';
	readonly intrinsics?: string;
	readonly text: 'reject' | 'ignore' | 'host';
	readonly capabilities: readonly string[];
	readonly validation?: Readonly<ExperimentalRendererValidationOptions>;
}

/** @experimental Canonical renderer-owned child-region metadata. */
export interface ExperimentalResolvedRendererBoundary {
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly prop: string;
	readonly server?: 'omit-child';
}

/** @experimental Canonical form used by compiler integrations and cache keys. */
export interface ExperimentalResolvedRendererConfig {
	readonly registry: Readonly<Record<string, ExperimentalResolvedRendererRegistryEntry>>;
	readonly boundaries: Readonly<
		Record<string, Readonly<Record<string, ExperimentalResolvedRendererBoundary>>>
	>;
	readonly default: string;
	readonly rules: readonly ExperimentalResolvedRendererRule[];
	readonly signature: string;
}

export interface OctaneConfigOptions {
	build?: {
		/** Output directory for the production build. @default 'dist' */
		outDir?: string;
		minify?: boolean;
		target?: BuildTarget;
	};
	adapter?: OctaneAdapter;
	/** @experimental Compiler-owned configuration shared by all bundler integrations. */
	compiler?: {
		/** Assert pure immutable-snapshot renders and reject detectable violations. @default false */
		strong?: boolean;
		/** Experimental native signal reads in DOM client/server render scopes. */
		nativeReads?: boolean;
		renderers?: ExperimentalRendererConfigOptions;
	};
	router?: {
		routes: Route[];
		/**
		 * Project-root module ID (e.g. '/src/pre-hydrate.ts') whose default
		 * export is a {@link PreHydrateHook}. The client hydrate entry imports it
		 * and awaits the hook before calling `hydrateRoot`.
		 */
		preHydrate?: string;
	};
	/**
	 * Global root pending/catch component entries used by client and SSR roots.
	 * Paths use project-root module IDs (for example `/src/Pending.tsrx`); a tuple
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
		/** Security policy for compiler-generated `module server` requests. */
		rpc?: {
			/** Additional exact HTTP(S) origins permitted to call server functions. */
			allowedOrigins?: string[];
			/** Maximum encoded request size in bytes. @default 1048576 */
			maxBodyBytes?: number;
		};
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
		target?: BuildTarget;
	};
	adapter?: OctaneAdapter;
	compiler: {
		/** @default false */
		strong: boolean;
		nativeReads: boolean;
		renderers: ExperimentalResolvedRendererConfig;
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
		rpc: {
			/** Additional normalized HTTP(S) origins. @default [] */
			allowedOrigins: string[];
			/** Maximum encoded request size in bytes. @default 1048576 */
			maxBodyBytes: number;
		};
		/** @default 'streaming' */
		render: 'streaming' | 'buffered';
	};
}

/**
 * The build context an Octane app integration passes to an adapter after it
 * produced the client and server bundles.
 */
export interface AdaptContext {
	/** Absolute project root. */
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
 * - `serverTarget` — selects the integration's Node or Web Worker server build.
 * - `runtime` — platform primitives (hashing, async context) replacing the
 *   entry's Node defaults; required for `serverTarget: 'webworker'`.
 */
export interface OctaneAdapter {
	name?: string;
	/** Server bundle runtime selected by the active app integration. @default 'node' */
	serverTarget?: 'node' | 'webworker';
	adapt?: (ctx: AdaptContext) => void | Promise<void>;
	serve?: AdapterServeFunction;
	runtime?: RuntimePrimitives;
}

export type AdapterServeFunction = (
	handler: (request: Request, platform?: unknown) => Response | Promise<Response>,
	options?: Record<string, unknown>,
) => { listen: (port?: number) => unknown; close: () => void };

/** A shared syntax accepted by current app integrations and their transpilers. */
export type BuildTarget = string | string[] | false;

export interface ConfigModuleRunner {
	loadModule(id: string): Promise<Record<string, unknown>>;
	getDependencies?(id: string): string[] | Promise<string[]>;
	getMissingDependencies?(id: string): string[] | Promise<string[]>;
}

export interface LoadConfigOptions {
	/** Config filename relative to the project root, or an absolute path. */
	configFile?: string;
	requireAdapter?: boolean;
	moduleRunner?: ConfigModuleRunner | ConfigModuleRunner['loadModule'];
	/** Directory used for the neutral evaluator's generated ESM module. */
	cacheDir?: string;
}

export interface LoadedOctaneConfig {
	config: ResolvedOctaneConfig;
	configPath: string;
	dependencies: string[];
	missingDependencies: string[];
}
