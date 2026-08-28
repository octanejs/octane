/** Serializable compiler metadata for OpenTUI-rendered TSRX modules. */
export const OPENTUI_RENDERER_ID = 'opentui';

export const opentuiRenderer = {
	module: '@octanejs/opentui/renderer',
	target: 'universal',
	server: 'unsupported',
	intrinsics: '@octanejs/opentui/intrinsics',
	text: 'host',
	capabilities: ['portal', 'visibility'],
} as const;

export const opentuiRendererRegistry = {
	[OPENTUI_RENDERER_ID]: opentuiRenderer,
} as const;

export const opentuiRendererRules = [
	{
		include: '**/*.opentui.tsrx',
		renderer: OPENTUI_RENDERER_ID,
	},
] as const;

export const opentuiRenderers = {
	registry: opentuiRendererRegistry,
	rules: opentuiRendererRules,
} as const;

/** Short compatibility name for application config files. */
export const renderers = opentuiRenderers;

export default opentuiRenderers;
