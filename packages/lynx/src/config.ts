import { LYNX_RENDERER_ID } from './core/renderer-id.js';

/**
 * Serializable compiler metadata for Lynx-rendered TSRX modules.
 *
 * This entry is deliberately data-only. It can be loaded by compiler and
 * language tooling without evaluating either Lynx runtime or an Octane host.
 */
export { LYNX_RENDERER_ID };

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
	'main-thread:ref',
	'main-thread:bind*',
	'main-thread:catch*',
	'main-thread:capture-bind*',
	'main-thread:capture-catch*',
	'main-thread:global-bind*',
] as const;

const LYNX_BACKGROUND_VALIDATION = {
	textHosts: ['raw-text'],
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
			'need-layout-complete-info',
			'layout-id',
		],
		'list-item': [
			'item-key',
			'sticky-top',
			'sticky-bottom',
			'full-span',
			'estimated-main-axis-size-px',
			'recyclable',
			'reuse-identifier',
			'defer',
		],
	},
} as const;

const LYNX_MAIN_THREAD_VALIDATION = {
	textHosts: ['raw-text'],
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
		'NativeModules',
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
		'@octanejs/lynx/platform',
		'octane/hydration',
		'octane/react',
		'octane/server',
		'octane/static',
		'preact',
		'react',
		'react-dom',
	],
	hostProps: LYNX_BACKGROUND_VALIDATION.hostProps,
} as const;

/** Background-thread renderer where Lynx platform APIs and Native Modules are legal. */
export const lynxBackgroundRenderer = {
	module: '@octanejs/lynx/renderer',
	target: 'universal',
	server: 'unsupported',
	intrinsics: '@octanejs/lynx/intrinsics',
	text: 'host',
	capabilities: ['class-name-alias', 'visibility', 'thread-functions'],
	validation: LYNX_BACKGROUND_VALIDATION,
} as const;

/** Main-thread renderer that rejects APIs owned by the background runtime. */
export const lynxMainThreadRenderer = {
	module: '@octanejs/lynx/main-renderer',
	target: 'universal',
	server: 'unsupported',
	intrinsics: '@octanejs/lynx/intrinsics',
	text: 'host',
	capabilities: ['class-name-alias', 'visibility', 'main-thread-render-only', 'thread-functions'],
	firstScreenEvents: ['bind*', 'catch*', 'capture-bind*', 'capture-catch*', 'global-bind*'],
	validation: LYNX_MAIN_THREAD_VALIDATION,
} as const;

/** Compatibility name for standalone Lynx authoring, which defaults to background. */
export const lynxRenderer = lynxBackgroundRenderer;

export const lynxBackgroundRendererRegistry = {
	[LYNX_RENDERER_ID]: lynxBackgroundRenderer,
} as const;

export const lynxMainThreadRendererRegistry = {
	[LYNX_RENDERER_ID]: lynxMainThreadRenderer,
} as const;

export const lynxRendererRegistry = lynxBackgroundRendererRegistry;

export const lynxRendererRules = [
	{
		include: '**/*.lynx.tsrx',
		renderer: LYNX_RENDERER_ID,
	},
] as const;

export const lynxRenderers = {
	registry: lynxRendererRegistry,
	rules: lynxRendererRules,
} as const;

/** Background native-app preset used by Rspeedy. */
export const lynxRspeedyBackgroundRenderers = {
	registry: lynxBackgroundRendererRegistry,
	default: LYNX_RENDERER_ID,
} as const;

/** Main-thread native-app preset used by Rspeedy. */
export const lynxRspeedyMainThreadRenderers = {
	registry: lynxMainThreadRendererRegistry,
	default: LYNX_RENDERER_ID,
} as const;

/** Compatibility preset for Rspeedy applications, which default to background. */
export const lynxRspeedyRenderers = lynxRspeedyBackgroundRenderers;

/** Short compatibility name for app config files. */
export const renderers = lynxRenderers;

export default lynxRenderers;
