// Vendored from react-router@7.18.1 packages/react-router/lib/types/params.ts — unmodified.
// Re-vendor with `node scripts/vendor-remix-router.mjs`; never hand-edit.
import type { Pages, RouteFiles } from './register';
import type { Normalize } from './utils';

export type Params<RouteFile extends keyof RouteFiles> = Normalize<
	Pages[RouteFiles[RouteFile]['page']]['params']
>;
