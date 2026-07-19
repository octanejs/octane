import type { RsbuildPlugin } from '@rsbuild/core';

export type OctaneLynxThread = 'background' | 'main-thread';

export interface OctaneLynxUniversalRuntime {
	readonly runtime: 'lynx';
	readonly thread: OctaneLynxThread;
}

export interface OctaneRspeedyPluginOptions {
	/** Compiler/runtime thread specialization. @default 'background' */
	thread?: OctaneLynxThread;
	/** Restrict the plugin to named Rspeedy environments. */
	environments?: string[];
	/** Override component HMR for the selected graph. */
	hmr?: boolean;
	/** Override development diagnostics for the selected graph. */
	dev?: boolean;
	/** Enable Octane component profiling. */
	profile?: boolean;
	/** Exclude path fragments from Octane ownership. */
	exclude?: string[];
	/** Require project modules to opt in with the `use octane` directive. */
	requireDirective?: boolean;
}

export const LYNX_BACKGROUND_LAYER: 'octane:background';
export const LYNX_MAIN_THREAD_LAYER: 'octane:main-thread';
export const LYNX_BACKGROUND_RUNTIME: Readonly<{
	runtime: 'lynx';
	thread: 'background';
}>;
export const LYNX_MAIN_THREAD_RUNTIME: Readonly<{
	runtime: 'lynx';
	thread: 'main-thread';
}>;

export interface LynxToolchainPackage {
	readonly path: string;
	readonly version: string;
}

export function assertLynxToolchain(
	root: string,
): Readonly<Record<'@lynx-js/rspeedy' | '@rsbuild/core' | '@rspack/core', LynxToolchainPackage>>;

export function pluginOctane(options?: OctaneRspeedyPluginOptions): RsbuildPlugin;
export const octane: typeof pluginOctane;
