import type { OctaneAdapter, AdaptContext } from '@octanejs/app-core';

// ============================================================================
// Adapter options
// ============================================================================

/** Serverless function configuration (functions/index.func/.vc-config.json). */
export interface ServerlessConfig {
	/**
	 * Node.js runtime version for the function.
	 * @default auto-detected from the build machine's Node major (22/24)
	 */
	runtime?: 'nodejs22.x' | 'nodejs24.x';
	/** Regions to deploy the function to (e.g. ['iad1']). */
	regions?: string[];
	/** Maximum execution duration in seconds. */
	maxDuration?: number;
	/** Memory in MB allocated to the function. */
	memory?: number;
}

/** Incremental Static Regeneration — edge-cache the SSR response. */
export interface ISRConfig {
	/** Seconds before the cached response regenerates; `false` = never expires. */
	expiration: number | false;
	/** Token bypassing the cache (`__prerender_bypass` cookie / revalidate header). */
	bypassToken?: string;
	/** Query params that are part of the cache key. */
	allowQuery?: string[];
}

export interface VercelAdapterOptions {
	serverless?: ServerlessConfig;
	isr?: ISRConfig;
	/** @default true */
	cleanUrls?: boolean;
	trailingSlash?: boolean;
	/** Vercel image optimization config (passed through to config.json). */
	images?: Record<string, unknown>;
	/** Extra response headers, matched by regex source. */
	headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
	/** Redirects, matched by regex source. */
	redirects?: Array<{ source: string; destination: string; permanent?: boolean }>;
}

// ============================================================================
// Build Output API v3 shapes (what adapt() writes)
// ============================================================================

export interface VercelRoute {
	src?: string;
	dest?: string;
	headers?: Record<string, string>;
	status?: number;
	continue?: boolean;
	handle?: string;
}

export interface VercelConfig {
	version: 3;
	routes: VercelRoute[];
	cleanUrls?: boolean;
	trailingSlash?: boolean;
	images?: Record<string, unknown>;
}

// ============================================================================
// Entry points
// ============================================================================

/**
 * The octane.config.ts adapter: the active app integration runs its `adapt()`
 * after producing dist/client + dist/server, emitting `.vercel/output/`
 * (Build Output API v3).
 */
export function vercel(options?: VercelAdapterOptions): OctaneAdapter;

/** The emitter itself — callable directly with an explicit build context. */
export function adapt(ctx: AdaptContext, options?: VercelAdapterOptions): Promise<void>;
