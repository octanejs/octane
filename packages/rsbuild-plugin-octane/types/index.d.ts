import type { RsbuildPlugin } from '@rsbuild/core';

export * from '@octanejs/app-core';
export {
	getOctaneConfigPath,
	loadOctaneConfig,
	loadOctaneConfigWithMetadata,
	octaneConfigExists,
} from '@octanejs/app-core/config-loader';

export interface OctaneRsbuildPluginOptions {
	/** Override component HMR in the browser environment. */
	hmr?: boolean;
	/** Enable component profiling in the browser environment. */
	profile?: boolean;
	/** Disable the compiler's parallel `use()` transform. */
	parallelUse?: boolean;
	/** Enable compiler-inferred component/calculation-region memoization in production. Default `true`. */
	autoMemo?: boolean;
	/** Ad-hoc path fragments skipped by the plain TypeScript/JavaScript hook-slot pass. */
	exclude?: string[];
	/** Rsbuild environment name used for the browser bundle. @default 'web' */
	clientEnvironment?: string;
	/** Rsbuild environment name used for the Node SSR bundle. @default 'node' */
	serverEnvironment?: string;
}

/** Full Octane metaframework integration for Rsbuild 2.x. */
export function pluginOctane(options?: OctaneRsbuildPluginOptions): RsbuildPlugin;

/** Alias matching the Vite integration's factory name. */
export const octane: typeof pluginOctane;
