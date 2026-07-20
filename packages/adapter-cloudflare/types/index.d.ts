import type { AdaptContext, OctaneAdapter } from '@octanejs/app-core';

/** The minimal execution-context surface used by the adapter. */
export interface CloudflareExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
	passThroughOnException(): void;
	props?: unknown;
}

/** Available as `context.platform` in Octane middleware and ServerRoutes. */
export interface CloudflarePlatform<
	Env = Record<string, unknown>,
	ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> {
	env: Env;
	ctx: ExecutionContext;
}

/** Select Cloudflare's Worker build target and emit dist/server/worker.js. */
export function cloudflare(): OctaneAdapter;

/** Emit dist/server/worker.js from completed Octane client/server bundles. */
export function adapt(ctx: AdaptContext): Promise<void>;
