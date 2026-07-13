// Vendored from react-router@8.2.0 packages/react-router/lib/types/route-module.ts — unmodified.
// Re-vendor with `node scripts/vendor-remix-router.mjs`; never hand-edit.
import type { Func } from './utils';

export type RouteModule = {
	meta?: Func;
	links?: Func;
	headers?: Func;
	loader?: Func;
	clientLoader?: Func;
	action?: Func;
	clientAction?: Func;
	HydrateFallback?: Func;
	default?: Func;
	ErrorBoundary?: Func;
	[key: string]: unknown; // allow user-defined exports
};
