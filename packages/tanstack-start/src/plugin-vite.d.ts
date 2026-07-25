import type { TanStackStartViteInputConfig } from '#tanstack-start/plugin-core/vite';
import type {
	OctaneRendererBoundaryOptions,
	OctaneRendererConfigOptions,
	OctaneRendererRegistryEntry,
	OctaneRendererRuleOptions,
	OctaneVitePluginOptions,
} from 'octane/compiler/vite';
import type { PluginOption } from 'vite';

export type OctaneRendererDescriptor = Exclude<OctaneRendererRegistryEntry, string>;
export type OctaneRendererBoundary = OctaneRendererBoundaryOptions;
export type OctaneRendererRule = OctaneRendererRuleOptions;
export type OctaneRendererConfig = OctaneRendererConfigOptions;
export type OctaneCompilerOptions = Omit<OctaneVitePluginOptions, 'ssr'> & {
	/**
	 * Shorthand for the compiler's command-aware profiling signal (mirrors
	 * `@octanejs/vite-plugin`'s `devtools` option): enables profiling in `vite
	 * dev` only, fully compiled out of `vite build`. An explicit `profile`
	 * always takes precedence over `devtools`.
	 */
	devtools?: boolean;
};

export type TanStackOctaneStartViteInputConfig = TanStackStartViteInputConfig & {
	octane?: OctaneCompilerOptions;
};

export declare function tanstackStart(
	options?: TanStackOctaneStartViteInputConfig,
): Array<PluginOption>;
