/** Serializable compiler configuration for Ink-rendered `.ink.tsrx` modules. */
export const INK_RENDERER_ID = 'ink';

export const inkRenderer = {
	module: '@octanejs/ink/renderer',
	target: 'universal',
	server: 'unsupported',
	intrinsics: '@octanejs/ink/intrinsics',
	text: 'host',
	capabilities: ['local-host-callback', 'visibility'],
	validation: {
		textHosts: ['ink-text', 'ink-virtual-text'],
		textParents: ['ink-text', 'ink-virtual-text'],
		hostProps: {
			'ink-box': ['internal_accessibility', 'internal_static', 'ref', 'style'],
			'ink-root': [],
			'ink-text': ['internal_accessibility', 'internal_transform', 'style'],
			'ink-virtual-text': ['internal_accessibility', 'internal_transform', 'style'],
		},
	},
} as const;

export const inkRenderers = {
	registry: { [INK_RENDERER_ID]: inkRenderer },
	rules: [{ include: '**/*.ink.tsrx', renderer: INK_RENDERER_ID }],
} as const;

/** Short compatibility name for application config files. */
export const renderers = inkRenderers;

export default inkRenderers;
