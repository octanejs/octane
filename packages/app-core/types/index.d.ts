import type { RuntimePrimitives } from '@ripple-ts/adapter';

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
}

export type NextFunction = () => Promise<Response>;
export type Middleware = (context: Context, next: NextFunction) => Response | Promise<Response>;
export type RouteHandler = (context: Context) => Response | Promise<Response>;

export function compose(
	middlewares: Middleware[],
): (context: Context, finalHandler: () => Promise<Response>) => Promise<Response>;
export function createContext(request: Request, params: Record<string, string>): Context;
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

/** State-transition behavior selected for Octane-authored modules. */
export type StateModel = 'causal' | 'permissive';

/**
 * State-model selection shared by compiler integrations.
 *
 * `default` applies to app-owned code and dependencies without a declaration or
 * exact package entry. `packages` cannot change the model of app-owned source.
 */
export interface StateModelConfigOptions {
	/** @default 'permissive' during the migration rollout */
	default?: StateModel;
	/** Exact dependency names; a permissive declaration requires a matching entry. */
	packages?: Readonly<Record<string, StateModel>>;
}

/** Canonical state-model configuration used by compiler integrations and cache keys. */
export interface ResolvedStateModelConfig {
	readonly default: StateModel;
	readonly packages: Readonly<Record<string, StateModel>>;
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
		renderers?: ExperimentalRendererConfigOptions;
		stateModel?: StateModelConfigOptions;
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
		renderers: ExperimentalResolvedRendererConfig;
		stateModel: ResolvedStateModelConfig;
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
