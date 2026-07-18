// Ported from styled-components 6.4.3 (MIT), adapted for octane. The RSC
// branches are dropped (octane has no RSC); context is provided via a
// `createElement(Provider, …)` descriptor so the same code runs on the client
// and server runtimes. The module-level server sheet uses a stateless output
// backend: Octane's active render owns every emitted chunk, so nothing
// request-specific is retained here.
import { createContext, createElement, isChildrenBlock, useContext, useMemo } from 'octane';
import type stylis from 'stylis';

import StyleSheet from '../sheet';
import { InsertionTarget, ShouldForwardProp, Stringifier } from '../types';
import createStylisInstance from '../utils/stylis';

export const mainSheet: StyleSheet = new StyleSheet();
export const mainStylis: Stringifier = createStylisInstance();

const SLOT_SSM_SHEET = Symbol.for('@octanejs/styled-components:ssm-sheet');
const SLOT_SSM_STYLIS = Symbol.for('@octanejs/styled-components:ssm-stylis');
const SLOT_SSM_VALUE = Symbol.for('@octanejs/styled-components:ssm-value');

export type IStyleSheetContext = {
	shouldForwardProp?: ShouldForwardProp<'web'> | undefined;
	styleSheet: StyleSheet;
	stylis: Stringifier;
	/** Preserved for inheritance - inner SSMs that set namespace/vendorPrefixes
	 *  but not stylisPlugins can still inherit the parent's plugins. */
	stylisPlugins?: stylis.Middleware[] | undefined;
};

const defaultContextValue: IStyleSheetContext = {
	shouldForwardProp: undefined,
	styleSheet: mainSheet,
	stylis: mainStylis,
	stylisPlugins: undefined,
};

export const StyleSheetContext = createContext<IStyleSheetContext>(defaultContextValue);

/**
 * Upstream's `StyleSheetContext.Consumer` as a component: expects a single
 * function child which is called with the current sheet context.
 */
export function StyleSheetConsumer(props: { children?: any }): unknown {
	const value = useContext(StyleSheetContext);
	const render = props.children;

	// Compiled element children arrive as children-block functions — only a
	// genuine render-prop function child receives the sheet context (same
	// guard as ThemeConsumer).
	if (typeof render === 'function' && !isChildrenBlock(render)) {
		return (render as (value: IStyleSheetContext) => unknown)(value);
	}

	if (process.env.NODE_ENV !== 'production' && render != null) {
		console.warn(
			'StyleSheetConsumer expects a single function child which receives the sheet context.',
		);
	}

	return null;
}

export type IStylisContext = Stringifier | void;

export function useStyleSheetContext() {
	return useContext(StyleSheetContext);
}

export type IStyleSheetManager = {
	children?: any;
	/**
	 * If desired, you can pass this prop to disable "speedy" insertion mode, which
	 * uses the browser [CSSOM APIs](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet).
	 * When disabled, rules are inserted as simple text into style blocks.
	 */
	disableCSSOMInjection?: undefined | boolean;
	/**
	 * If you are working exclusively with modern browsers, vendor prefixes can often be omitted
	 * to reduce the weight of CSS on the page.
	 */
	enableVendorPrefixes?: undefined | boolean;
	/**
	 * Provide an optional selector to be prepended to all generated style rules.
	 */
	namespace?: undefined | string;
	/**
	 * Create and provide your own `StyleSheet` if necessary for advanced SSR scenarios.
	 * When provided, `target` and `nonce` props are ignored (configure them on the sheet directly).
	 */
	sheet?: undefined | StyleSheet;
	/**
	 * Starting in v6, styled-components no longer does its own prop validation
	 * and recommends use of transient props "$prop" to pass style-only props to
	 * components. If for some reason you are not able to use transient props, a
	 * prop validation function can be provided via `StyleSheetManager`, such as
	 * `@emotion/is-prop-valid`.
	 *
	 * When the return value is `true`, props will be forwarded to the DOM/underlying
	 * component. If return value is `false`, the prop will be discarded after styles
	 * are calculated.
	 *
	 * Manually composing `styled.{element}.withConfig({shouldForwardProp})` will
	 * override this default.
	 *
	 * When nested inside another `StyleSheetManager`, omitting this prop inherits
	 * the parent's function. Pass `undefined` explicitly or a passthrough function
	 * to disable inherited behavior for a subtree.
	 */
	shouldForwardProp?: undefined | IStyleSheetContext['shouldForwardProp'];
	/**
	 * An array of plugins to be run by stylis (style processor) during compilation.
	 * Check out [what's available on npm*](https://www.npmjs.com/search?q=keywords%3Astylis).
	 *
	 * \* The plugin(s) must be compatible with stylis v4 or above.
	 *
	 * When nested inside another `StyleSheetManager`, omitting this prop inherits
	 * the parent's plugins. Pass an empty array (`[]`) to explicitly disable
	 * inherited plugins for a subtree.
	 */
	stylisPlugins?: undefined | stylis.Middleware[];
	/**
	 * CSP nonce to attach to injected `<style>` tags. Overrides auto-detection
	 * from `<meta name="sc-nonce">`, `<meta property="csp-nonce">`, or `__webpack_nonce__`.
	 */
	nonce?: undefined | string;
	/**
	 * Provide an alternate DOM node to host generated styles; useful for iframes.
	 */
	target?: undefined | InsertionTarget;
};

/** Configure style injection for descendant styled components (target element, stylis plugins, prop forwarding). */
export function StyleSheetManager(props: IStyleSheetManager): unknown {
	const parentContext = useStyleSheetContext();
	const { styleSheet } = parentContext;

	const resolvedStyleSheet = useMemo(
		() => {
			let sheet = styleSheet;

			if (props.sheet) {
				sheet = props.sheet;
			} else if (props.target) {
				sheet = sheet.reconstructWithOptions(
					props.nonce !== undefined
						? { target: props.target, nonce: props.nonce }
						: { target: props.target },
					false,
				);
			} else if (props.nonce !== undefined) {
				sheet = sheet.reconstructWithOptions({ nonce: props.nonce });
			}

			if (props.disableCSSOMInjection) {
				sheet = sheet.reconstructWithOptions({ useCSSOMInjection: false });
			}

			return sheet;
		},
		[props.disableCSSOMInjection, props.nonce, props.sheet, props.target, styleSheet],
		SLOT_SSM_SHEET,
	);

	// Inherit parent stylis when no stylis-related props are provided.
	// When any stylis option (namespace, vendorPrefixes) changes, create a new
	// instance but still inherit plugins from the parent if stylisPlugins is omitted.
	// An explicit empty array disables inherited plugins.
	const stylisInstance = useMemo(
		() =>
			props.stylisPlugins === undefined &&
			props.namespace === undefined &&
			props.enableVendorPrefixes === undefined
				? parentContext.stylis
				: createStylisInstance({
						options: { namespace: props.namespace, prefix: props.enableVendorPrefixes },
						plugins: props.stylisPlugins ?? parentContext.stylisPlugins,
					}),
		[
			props.enableVendorPrefixes,
			props.namespace,
			props.stylisPlugins,
			parentContext.stylis,
			parentContext.stylisPlugins,
		],
		SLOT_SSM_STYLIS,
	);

	// Inherit parent shouldForwardProp when not provided.
	const shouldForwardProp =
		'shouldForwardProp' in props ? props.shouldForwardProp : parentContext.shouldForwardProp;

	// Resolve which plugins to propagate: own > parent > none
	const resolvedPlugins = props.stylisPlugins ?? parentContext.stylisPlugins;

	const styleSheetContextValue = useMemo(
		() => ({
			shouldForwardProp,
			styleSheet: resolvedStyleSheet,
			stylis: stylisInstance,
			stylisPlugins: resolvedPlugins,
		}),
		[shouldForwardProp, resolvedStyleSheet, stylisInstance, resolvedPlugins],
		SLOT_SSM_VALUE,
	);

	return createElement(StyleSheetContext.Provider as any, {
		value: styleSheetContextValue,
		children: props.children,
	});
}
