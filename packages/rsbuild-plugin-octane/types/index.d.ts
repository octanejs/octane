import type { RsbuildPlugin } from '@rsbuild/core';
import type { OctaneRspackPluginOptions } from '@octanejs/rspack-plugin';

export * from '@octanejs/app-core';
export {
	getOctaneConfigPath,
	loadOctaneConfig,
	loadOctaneConfigWithMetadata,
	octaneConfigExists,
} from '@octanejs/app-core/config-loader';

export interface OctaneRsbuildPluginOptions {
	/**
	 * @experimental Fold authenticated JavaScript CSS-module exports in one-shot
	 * production builds. Uses the Rspack plugin's exact-source provider contract;
	 * native `css/module` remains unchanged. Disabled by default.
	 */
	cssModuleConstants?: OctaneRspackPluginOptions['cssModuleConstants'];
	/** Override component HMR in the browser environment. */
	hmr?: boolean;
	/**
	 * Compile Octane modules in Rspack worker threads. Enabled by default with
	 * at most four workers; set `false` to keep compilation on the main thread.
	 * Provide `maxWorkers` to request a different shared worker-pool limit.
	 * @default true
	 */
	parallel?: boolean | { maxWorkers?: number };
	/** Enable component profiling in the browser environment. */
	profile?: boolean;
	/**
	 * Override `compiler.strong` for this integration. Strong asserts pure
	 * immutable-snapshot renders in project-owned modules; dependencies can opt
	 * in with `"use strong"`.
	 */
	strong?: boolean;
	/** Experimental native signal reads in DOM client/server render scopes. */
	nativeReads?: boolean;
	/**
	 * Ad-hoc path fragments skipped by the plain TypeScript/JavaScript
	 * hook-slot pass. With `requireDirective`, excluded paths are exempt from
	 * Octane ownership entirely — including `.tsrx`/`.tsx` — for projects
	 * routing those paths through a different tsrx compiler (e.g.
	 * `@tsrx/react`).
	 */
	exclude?: string[];
	/**
	 * Mixed-toolchain ownership gate: project `.tsrx` stays Octane's by
	 * extension; a project `.tsx` (full compile) or plain `.ts`/`.js`
	 * (hook slotting) is Octane's only with a leading
	 * `@jsxImportSource octane` pragma comment. Unmarked modules pass
	 * through to the host framework's own pipeline. See
	 * `@octanejs/rspack-plugin` for details.
	 * @default false
	 */
	requireDirective?: boolean;
	/** Rsbuild environment name used for the browser bundle. @default 'web' */
	clientEnvironment?: string;
	/** Rsbuild environment name used for the Node SSR bundle. @default 'node' */
	serverEnvironment?: string;
}

/** Full Octane metaframework integration for Rsbuild 2.x. */
export function pluginOctane(options?: OctaneRsbuildPluginOptions): RsbuildPlugin;

/** Alias matching the Vite integration's factory name. */
export const octane: typeof pluginOctane;
