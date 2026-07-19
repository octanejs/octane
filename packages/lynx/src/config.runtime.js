/**
 * Node-loadable compiler metadata for Lynx-rendered TSRX modules.
 *
 * Keep this value-identical to config.ts. The package test compares both
 * modules so the JS entry consumed by Rspeedy cannot drift from TS authoring.
 */
export const LYNX_RENDERER_ID = 'lynx';

const LYNX_STANDARD_PROPS = [
	'id',
	'ref',
	'class',
	'className',
	'style',
	'hidden',
	'animation',
	'flatten',
	'name',
	'overlap',
	'overlap-ios',
	'enableLayoutOnly',
	'cssAlignWithLegacyW3C',
	'accessibility-*',
	'ios-platform-accessibility-id',
	'focusable',
	'focus-index',
	'next-focus-*',
	'__lynx_timing_flag',
	'ios-background-shape-layer',
	'exposure-*',
	'enable-exposure-ui-margin',
	'enable-exposure-ui-clip',
	'user-interaction-enabled',
	'native-interaction-enabled',
	'block-native-event',
	'block-native-event-areas',
	'consume-slide-event',
	'event-through',
	'enable-touch-pseudo-propagation',
	'hit-slop',
	'ignore-focus',
	'ios-enable-simultaneous-touch',
	'event-through-active-regions',
	'data-*',
	'bind*',
	'catch*',
	'capture-bind*',
	'capture-catch*',
	'global-bind*',
];

const LYNX_VALIDATION = {
	textParents: ['text'],
	forbiddenGlobals: [
		'customElements',
		'document',
		'Element',
		'FinalizationRegistry',
		'HTMLElement',
		'localStorage',
		'MutationObserver',
		'navigator',
		'Node',
		'queueMicrotask',
		'sessionStorage',
		'structuredClone',
		'WeakRef',
		'window',
	],
	forbiddenImports: [
		'@lynx-js/react',
		'@octanejs/testing-library',
		'octane/hydration',
		'octane/react',
		'octane/server',
		'octane/static',
		'preact',
		'react',
		'react-dom',
	],
	hostProps: {
		'*': LYNX_STANDARD_PROPS,
		page: [],
		view: [],
		text: [
			'text-maxline',
			'text-maxlength',
			'text-single-line-vertical-align',
			'include-font-padding',
			'text-selection',
		],
		'raw-text': ['text'],
		image: [
			'src',
			'mode',
			'placeholder',
			'blur-radius',
			'cap-insets',
			'cap-insets-scale',
			'loop-count',
			'auto-size',
			'autoplay',
			'tint-color',
		],
		'scroll-view': [
			'scroll-orientation',
			'bounces',
			'enable-scroll',
			'scroll-bar-enable',
			'upper-threshold',
			'lower-threshold',
			'initial-scroll-offset',
			'initial-scroll-to-index',
		],
		input: [
			'placeholder',
			'confirm-type',
			'maxlength',
			'readonly',
			'disabled',
			'show-soft-input-on-focus',
			'input-filter',
			'type',
		],
		textarea: [
			'placeholder',
			'confirm-type',
			'maxlength',
			'maxlines',
			'bounces',
			'line-spacing',
			'readonly',
			'disabled',
			'show-soft-input-on-focus',
			'input-filter',
			'enable-scroll-bar',
			'type',
		],
		list: [
			'scroll-orientation',
			'span-count',
			'list-type',
			'enable-scroll',
			'enable-nested-scroll',
			'sticky',
			'sticky-offset',
			'bounces',
			'initial-scroll-index',
			'need-visible-item-info',
			'lower-threshold-item-count',
			'upper-threshold-item-count',
			'scroll-event-throttle',
			'item-snap',
			'preload-buffer-count',
			'experimental-search-ref-anchor-strategy',
			'scroll-bar-enable',
		],
		'list-item': [
			'item-key',
			'sticky-top',
			'sticky-bottom',
			'full-span',
			'estimated-main-axis-size-px',
			'recyclable',
		],
	},
};

export const lynxRenderer = {
	module: '@octanejs/lynx/renderer',
	target: 'universal',
	server: 'unsupported',
	intrinsics: '@octanejs/lynx/intrinsics',
	text: 'host',
	capabilities: ['visibility'],
	validation: LYNX_VALIDATION,
};

export const lynxRendererRegistry = {
	[LYNX_RENDERER_ID]: lynxRenderer,
};

export const lynxRendererRules = [
	{
		include: '**/*.lynx.tsrx',
		renderer: LYNX_RENDERER_ID,
	},
];

export const lynxRenderers = {
	registry: lynxRendererRegistry,
	rules: lynxRendererRules,
};

/** Native-app preset used by Rspeedy, where every TSRX file targets Lynx. */
export const lynxRspeedyRenderers = {
	registry: lynxRendererRegistry,
	default: LYNX_RENDERER_ID,
};

/** Short compatibility name for app config files. */
export const renderers = lynxRenderers;

export default lynxRenderers;
