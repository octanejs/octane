import type { Plugin, ViteDevServer } from 'vite';
import type {
	ConfigModuleRunner,
	ExperimentalRendererConfigOptions,
	LoadedOctaneConfig,
	OctaneConfigOptions,
	ResolvedOctaneConfig,
} from '@octanejs/app-core';

export * from '@octanejs/app-core';

export interface OctanePluginOptions {
	/** Override the client HMR default (on in serve mode, off for SSR). */
	hmr?: boolean;
	/** Enable component profiling in client transforms. */
	profile?: boolean;
	/**
	 * Path fragments the compiler's plain `.ts`/`.js` hook-slotting pass must
	 * skip. Prefer package manifest `octane.hookSlots.manual` declarations.
	 */
	exclude?: string[];
	/**
	 * Mixed-toolchain ownership gate: when `true`, Octane compiles only
	 * project modules that declare `'use octane'` in their directive prologue.
	 * Undirected project `.tsx`/`.ts`/`.js` pass through to the host
	 * framework's own pipeline (e.g. React's JSX transform); an undirected
	 * project `.tsrx` is a build error. Installed and linked packages keep
	 * their Octane package-manifest decision. The directive is always
	 * tolerated and stripped from compiled output, even when this is off.
	 * @default false
	 */
	requireDirective?: boolean;
	/**
	 * @experimental Full renderer-config override. When omitted, the compiler
	 * reads `compiler.renderers` from `octane.config.ts` before transforming modules.
	 */
	renderers?: ExperimentalRendererConfigOptions;
}

/** The Octane compiler plugin plus Vite app/metaframework integration. */
export function octane(options?: OctanePluginOptions): Plugin[];

/** Return whether a dev request belongs to Vite rather than an app route. */
export function isViteOwnedUrl(url: URL, fileRoots?: string[]): boolean;

export interface ViteLoadConfigOptions {
	vite?: ViteDevServer;
	moduleRunner?: ConfigModuleRunner | ConfigModuleRunner['loadModule'];
	requireAdapter?: boolean;
	configFile?: string;
	cacheDir?: string;
}

export function getOctaneConfigPath(projectRoot: string, configFile?: string): string;
export function octaneConfigExists(projectRoot: string, configFile?: string): boolean;
export function loadOctaneConfig(
	projectRoot: string,
	options?: ViteLoadConfigOptions,
): Promise<ResolvedOctaneConfig>;
export function loadOctaneConfigWithMetadata(
	projectRoot: string,
	options?: ViteLoadConfigOptions,
): Promise<LoadedOctaneConfig>;
export function resolveOctaneConfig(
	raw: OctaneConfigOptions,
	options?: { requireAdapter?: boolean },
): ResolvedOctaneConfig;
