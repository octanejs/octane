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
	 * With `requireDirective`, excluded paths are exempt from Octane ownership
	 * entirely — including `.tsrx`/`.tsx` — for projects routing those paths
	 * through a different tsrx compiler (e.g. `@tsrx/react`).
	 */
	exclude?: string[];
	/**
	 * Mixed-toolchain ownership gate: when `true`, a project `.tsrx` is
	 * Octane's by extension, and a project `.tsx` (full compile) or plain
	 * `.ts`/`.js` (hook slotting) is Octane's only when it opens with a
	 * leading `@jsxImportSource octane` pragma comment (any registered
	 * renderer's intrinsics module also counts). A pragma naming a
	 * foreign source (e.g. `react`) does not claim the file. Unmarked
	 * project modules pass through to the host framework's own pipeline
	 * (e.g. React's JSX transform). Installed and linked packages keep
	 * their Octane package-manifest decision.
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
