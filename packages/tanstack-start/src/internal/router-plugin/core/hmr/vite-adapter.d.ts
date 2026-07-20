import { Config } from '../config.js';
import type * as t from '@babel/types';
/**
 * Emits HMR accept code for Vite / native ESM HMR: `import.meta.hot.accept`
 * with a callback that receives the freshly re-imported module.
 *
 * Framework-specific component runtimes still own component body patching.
 * The route signature only suppresses a redundant data invalidation when an
 * Octane update changed extracted component code but not the route definition.
 */
export declare function createViteHmrStatement(
	stableRouteOptionKeys: Array<string>,
	opts: {
		targetFramework: Config['target'];
		routeId?: string;
		routeSignature?: string;
	},
): Array<t.Statement>;
