import type { AstroIntegration, AstroRenderer } from 'astro';

export type FilterPattern = string | RegExp | Array<string | RegExp>;

export interface OctaneAstroOptions {
	/**
	 * Limit which modules this renderer claims when multiple JSX frameworks are
	 * installed. Mirrored into the server `check()` filter.
	 */
	include?: FilterPattern;
	/**
	 * Modules this renderer must not claim. `.astro` is always excluded from the
	 * Octane Vite compiler regardless of this option.
	 */
	exclude?: FilterPattern;
	/**
	 * Mixed-toolchain ownership gate for `octane/compiler/vite`. Project `.tsrx`
	 * stays Octane's by extension; project `.tsx` / `.ts` / `.js` need a leading
	 * `@jsxImportSource octane` pragma unless this is `false`.
	 * @default true
	 */
	requireDirective?: boolean;
	/** Enable Octane component profiling metadata in client transforms. */
	profile?: boolean;
	/** Override Octane HMR codegen (defaults to on while Vite is serving). */
	hmr?: boolean;
	/**
	 * Reserved: v1 always buffers island HTML with hydratable `renderToString`.
	 * Kept for API symmetry with `@astrojs/react`.
	 */
	experimentalDisableStreaming?: boolean;
}

/**
 * Options serialized into the `astro:octane:opts` virtual module.
 * String globs are compiled to RegExp at Vite config time (Node) so the
 * SSR server entry never imports picomatch.
 */
export interface VirtualModuleOptions {
	include: RegExp[] | null;
	exclude: RegExp[] | null;
	experimentalDisableStreaming: boolean;
}

/** Astro integration factory — default export of `@octanejs/astro`. */
declare function octane(options?: OctaneAstroOptions): AstroIntegration;
export default octane;

export function getContainerRenderer(): AstroRenderer;
