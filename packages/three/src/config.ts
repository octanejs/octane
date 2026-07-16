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
	capabilities: ['local-host-callback', 'visibility', 'portal'],
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

export const threeRendererBoundaries = {
	'@octanejs/three': {
		Canvas: {
			ownerRenderer: 'dom',
			childRenderer: THREE_RENDERER_ID,
			prop: 'children',
			server: 'omit-child',
		},
	},
} as const;

export const threeRenderers = {
	registry: threeRendererRegistry,
	rules: threeRendererRules,
	boundaries: threeRendererBoundaries,
} as const;

/** Short compatibility name for app config files. */
export const renderers = threeRenderers;

export default threeRenderers;
