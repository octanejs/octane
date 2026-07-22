import type { RsbuildPlugin } from '@rsbuild/core';

export type OctaneLynxThread = 'background' | 'main-thread';

export interface OctaneLynxUniversalRuntime {
	readonly runtime: 'lynx';
	readonly thread: OctaneLynxThread;
}

export interface OctaneRspeedyPluginOptions {
	/**
	 * Select one isolated compiler graph for diagnostics and source tests.
	 * Omit this option to build the dual-thread application graph: a synchronous
	 * main-thread first screen followed by background runtime adoption.
	 */
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
	/**
	 * Require project `.tsx`/`.ts`/`.js` modules to opt in with a leading
	 * `@jsxImportSource octane` pragma comment; `.tsrx` stays Octane's by
	 * extension and needs no marker.
	 */
	requireDirective?: boolean;
}

export const LYNX_BACKGROUND_LAYER: 'octane:background';
export const LYNX_MAIN_THREAD_LAYER: 'octane:main-thread';
export const LYNX_TARGET_SDK_VERSION: '3.9';
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

export type LynxToolchainLaneName = 'minimum' | 'current';

export interface LynxToolchainLane {
	readonly description: string;
	readonly lynxSdk: '3.9.0';
	readonly targetSdk: '3.9';
	readonly packages: Readonly<
		Record<
			| '@lynx-js/cache-events-webpack-plugin'
			| '@lynx-js/chunk-loading-webpack-plugin'
			| '@lynx-js/css-extract-webpack-plugin'
			| '@lynx-js/debug-metadata'
			| '@lynx-js/debug-metadata-rsbuild-plugin'
			| '@lynx-js/rspeedy'
			| '@lynx-js/runtime-wrapper-webpack-plugin'
			| '@lynx-js/tasm'
			| '@lynx-js/template-webpack-plugin'
			| '@lynx-js/testing-environment'
			| '@lynx-js/types'
			| '@lynx-js/web-core'
			| '@lynx-js/web-rsbuild-server-middleware'
			| '@lynx-js/webpack-dev-transport'
			| '@lynx-js/webpack-runtime-globals'
			| '@lynx-js/websocket'
			| '@rsbuild/core'
			| '@rsbuild/plugin-css-minimizer'
			| '@rsdoctor/rspack-plugin'
			| '@rspack/core'
			| 'typescript'
			| 'webpack',
			string
		>
	>;
}

export const LYNX_TOOLCHAIN_LANES: Readonly<Record<LynxToolchainLaneName, LynxToolchainLane>>;

export function assertLynxToolchain(
	root: string,
	lane?: LynxToolchainLaneName,
): Readonly<
	Record<
		| '@lynx-js/cache-events-webpack-plugin'
		| '@lynx-js/chunk-loading-webpack-plugin'
		| '@lynx-js/css-extract-webpack-plugin'
		| '@lynx-js/debug-metadata'
		| '@lynx-js/debug-metadata-rsbuild-plugin'
		| '@lynx-js/rspeedy'
		| '@lynx-js/runtime-wrapper-webpack-plugin'
		| '@lynx-js/tasm'
		| '@lynx-js/template-webpack-plugin'
		| '@lynx-js/types'
		| '@lynx-js/web-core'
		| '@lynx-js/web-rsbuild-server-middleware'
		| '@lynx-js/webpack-dev-transport'
		| '@lynx-js/webpack-runtime-globals'
		| '@lynx-js/websocket'
		| '@rsbuild/core'
		| '@rsbuild/plugin-css-minimizer'
		| '@rsdoctor/rspack-plugin'
		| '@rspack/core',
		LynxToolchainPackage
	>
>;

export function pluginOctane(options?: OctaneRspeedyPluginOptions): RsbuildPlugin;
export const octane: typeof pluginOctane;
