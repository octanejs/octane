import type { RuntimePrimitives } from '@ripple-ts/adapter';
import type {
	Route,
	Middleware,
	OctaneConfigOptions,
	ResolvedOctaneConfig,
	Component,
} from '@octanejs/app-core';
import type { RenderResult, StreamOptions, RenderOptions } from 'octane/server';

export function resolveOctaneConfig(
	raw: OctaneConfigOptions,
	options?: { requireAdapter?: boolean },
): ResolvedOctaneConfig;

export interface ClientAssetEntry {
	/** Path to the built JS file (relative to the client output dir) */
	js: string;
	/** Paths to the built CSS files (relative to the client output dir) */
	css: string[];
}

export interface ServerManifest {
	routes: Route[];
	/** RenderRoute entry module path → module namespace (export picked per-route) */
	components: Record<string, Record<string, unknown>>;
	/** Layout module path → module namespace */
	layouts: Record<string, Record<string, unknown>>;
	middlewares: Middleware[];
	/** Trust X-Forwarded-* headers when deriving origin for RPC fetch */
	trustProxy?: boolean;
	/** 'streaming' (default) renders via renderToReadableStream; 'buffered' awaits everything via prerender */
	render?: 'streaming' | 'buffered';
	/** Resolved server-compiled global boundary components. */
	rootBoundary?: {
		pending?: Component | null;
		catch?: Component<{ error: unknown; reset: () => void }> | null;
	};
	/** Import descriptors serialized to the client hydration payload. */
	rootBoundaryEntries?: {
		pending: { path: string; exportName: string | null } | null;
		catch: { path: string; exportName: string | null } | null;
	};
	/** config `router.preHydrate`, serialized into #__octane_data for the client entry */
	preHydrate?: string | null;
	/** Map of entry path → `module server` namespace for RPC support */
	rpcModules?: Record<string, Record<string, Function>>;
	/** Platform primitives (adapter's, or the generated entry's Node defaults) */
	runtime?: RuntimePrimitives;
	/** Route entry module path → built client asset paths (preload tags) */
	clientAssets?: Record<string, ClientAssetEntry>;
}

export interface HandlerOptions {
	/** `renderToReadableStream` from 'octane/server' (the streaming engine dev SSR uses) */
	renderToReadableStream: (
		component: Function,
		props?: unknown,
		options?: StreamOptions,
	) => Promise<ReadableStream<Uint8Array>>;
	/** `prerender` from 'octane/static' (the buffered await-everything fallback) */
	prerender: (
		component: Function,
		props?: unknown,
		options?: RenderOptions,
	) => Promise<RenderResult>;
	/** The BUILT dist client index.html (moved to dist/server by the build) */
	htmlTemplate: string;
	/** RPC executor from 'octane/server' */
	executeServerFunction: (fn: Function, body: string) => Promise<string>;
	/** Boundary primitives from 'octane/server'. */
	Suspense: Component;
	ErrorBoundary: Component;
	createElement: Function;
}

/**
 * Production fetch-handler factory. Mirrors the dev middleware's render path
 * byte-for-byte in everything hydration can see. Repeated calls in one process
 * refresh the same-origin fetch dispatcher, so a dev server can replace a
 * hot-reloaded manifest without retaining the first handler.
 */
export function createHandler(
	manifest: ServerManifest,
	options: HandlerOptions,
): (request: Request) => Promise<Response>;

export function createPropsWrapper(Page: Component, pageProps: Record<string, unknown>): Component;
export function createLayoutWrapper(
	Layout: Component,
	Page: Component,
	pageProps: Record<string, unknown>,
): Component;
export function createRootBoundaryWrapper(
	Content: Component,
	boundary: { pending?: Component | null; catch?: Component | null },
	runtime: { Suspense: Component; ErrorBoundary: Component; createElement: Function },
): Component;
