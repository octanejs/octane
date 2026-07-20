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
	/**
	 * Ad-hoc path fragments skipped by the plain TypeScript/JavaScript
	 * hook-slot pass. With `requireDirective`, excluded paths are exempt from
	 * Octane ownership entirely — including `.tsrx`/`.tsx` — for projects
	 * routing those paths through a different tsrx compiler (e.g.
	 * `@tsrx/react`). Excluded output carries no Octane state-model ABI, so an
	 * otherwise Octane-owned causal `.ts`/`.js` helper cannot be excluded;
	 * classify third-party compatibility through `stateModel.packages` instead.
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
	/** Override compiler.stateModel for this Rsbuild integration. */
	stateModel?: import('@octanejs/app-core').StateModelConfigOptions;
	/** Rsbuild environment name used for the browser bundle. @default 'web' */
	clientEnvironment?: string;
	/** Rsbuild environment name used for the Node SSR bundle. @default 'node' */
	serverEnvironment?: string;
}

/** Full Octane metaframework integration for Rsbuild 2.x. */
export function pluginOctane(options?: OctaneRsbuildPluginOptions): RsbuildPlugin;

/** Alias matching the Vite integration's factory name. */
export const octane: typeof pluginOctane;
