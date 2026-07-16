/**
 * Serializable compiler metadata for Three-rendered TSRX modules.
 *
 * This module intentionally imports neither Three nor an Octane runtime. Vite,
 * Rspack, Rsbuild, and language tooling can load the same data without creating
 * renderer state or evaluating browser-only code.
 */
export const THREE_RENDERER_ID = 'three';

export const threeRenderer = {
	module: '@octanejs/three/renderer',
	target: 'universal',
	server: 'client-only',
	intrinsics: '@octanejs/three/intrinsics',
	text: 'ignore',
	capabilities: ['local-host-callback', 'visibility'],
} as const;

export const threeRendererRegistry = {
	[THREE_RENDERER_ID]: threeRenderer,
} as const;

export const threeRendererRules = [
	{
		include: '**/*.three.tsrx',
		renderer: THREE_RENDERER_ID,
	},
] as const;

// The DOM -> Three Canvas boundary lands with the root/store in Milestone 3.
// Keeping this empty ensures the current preset does not advertise an export
// that the package cannot mount yet.
export const threeRendererBoundaries = {} as const;

export const threeRenderers = {
	registry: threeRendererRegistry,
	rules: threeRendererRules,
	boundaries: threeRendererBoundaries,
} as const;

/** Short compatibility name for app config files. */
export const renderers = threeRenderers;

export default threeRenderers;
