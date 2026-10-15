import type { OctaneRspackPluginOptions } from '@octanejs/rspack-plugin';
import type { RsbuildPlugin } from '@rsbuild/core';
import type { TanStackStartRsbuildInputConfig } from '#tanstack-start/plugin-core/rsbuild';

export type OctaneCompilerOptions = Omit<
	OctaneRspackPluginOptions,
	'environment' | 'root' | 'transpile'
> & {
	/**
	 * Enables profiling during `rsbuild dev` and compiles it out of production
	 * builds. An explicit `profile` option takes precedence.
	 */
	devtools?: boolean;
};

export type TanStackOctaneStartRsbuildInputConfig = Omit<
	TanStackStartRsbuildInputConfig,
	'octane'
> & {
	/** Use compiled route bodies and the compiled Router document boundary. */
	compiled?: boolean;
	octane?: OctaneCompilerOptions;
};

export declare function tanstackStart(
	options?: TanStackOctaneStartRsbuildInputConfig,
): RsbuildPlugin;
