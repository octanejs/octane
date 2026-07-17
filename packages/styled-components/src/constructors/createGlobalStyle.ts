// Ported from styled-components 6.4.3 (MIT), adapted for octane:
// - No RSC/`__SERVER__` build flags — server vs client is the sheet's runtime
//   `server` flag (conditional hooks are legal in octane, slots are explicit).
// - Server renders styles during component execution (effects never run on the
//   server); the sheet forwards them to octane's per-request css channel.
// - On the client, the first layout effect additionally adopts-by-replacement:
//   it removes the server-emitted css-channel tags for this component right
//   after inserting the equivalent rules into the client engine (pre-paint).
import { memo, useContext, useLayoutEffect, useRef } from 'octane';

import { STATIC_EXECUTION_CONTEXT } from '../constants';
import GlobalStyle from '../models/GlobalStyle';
import { useStyleSheetContext } from '../models/StyleSheetManager';
import { DefaultTheme, ThemeContext } from '../models/ThemeProvider';
import StyleSheet from '../sheet';
import { removeServerGlobalTags } from '../sheet/octaneChannel';
import { ExecutionContext, ExecutionProps, Interpolation, Stringifier, Styles } from '../types';
import { checkDynamicCreation } from '../utils/checkDynamicCreation';
import determineTheme from '../utils/determineTheme';
import generateComponentId from '../utils/generateComponentId';
import css from './css';

const SLOT_GS_INSTANCE = Symbol.for('@octanejs/styled-components:gs-instance');
const SLOT_GS_PREV = Symbol.for('@octanejs/styled-components:gs-prev');
const SLOT_GS_UPDATE = Symbol.for('@octanejs/styled-components:gs-update');
const SLOT_GS_CLEANUP = Symbol.for('@octanejs/styled-components:gs-cleanup');

/**
 * Create a component that injects global CSS when mounted. Supports theming and dynamic props.
 *
 * ```tsx
 * const GlobalStyle = createGlobalStyle`
 *   body { margin: 0; font-family: system-ui; }
 * `;
 * // Render <GlobalStyle /> at the root of your app
 * ```
 */
export default function createGlobalStyle<Props extends object>(
	strings: Styles<Props>,
	...interpolations: Array<Interpolation<Props>>
) {
	const rules = css<Props>(strings, ...interpolations);
	const styledComponentId = `sc-global-${generateComponentId(JSON.stringify(rules))}`;
	const globalStyle = new GlobalStyle<Props>(rules, styledComponentId);

	if (process.env.NODE_ENV !== 'production') {
		checkDynamicCreation(styledComponentId);
	}

	const GlobalStyleComponent = (props: ExecutionProps & Props, _scope?: any) => {
		const ssc = useStyleSheetContext();
		const theme = useContext(ThemeContext);

		// Each mount needs a unique instance ID for the shared-group instanceRules
		// cache. On the server allocate directly (one-shot renders); on the client
		// keep it stable across re-renders via a ref.
		let instance: number;
		if (ssc.styleSheet.server) {
			instance = ssc.styleSheet.allocateGSInstance(styledComponentId);
		} else {
			const instanceRef = useRef<number | null>(null, SLOT_GS_INSTANCE);
			if (instanceRef.current === null) {
				instanceRef.current = ssc.styleSheet.allocateGSInstance(styledComponentId);
			}
			instance = instanceRef.current;
		}

		if (process.env.NODE_ENV !== 'production' && (props as any).children != null) {
			console.warn(
				`The global style component ${styledComponentId} was given child JSX. createGlobalStyle does not render children.`,
			);
		}

		if (
			process.env.NODE_ENV !== 'production' &&
			rules.some((rule) => typeof rule === 'string' && rule.indexOf('@import') !== -1)
		) {
			console.warn(
				`Please do not use @import CSS syntax in createGlobalStyle at this time, as the CSSOM APIs we use in production do not handle it well. Instead, we recommend embedding a typical <link> meta tag in your document <head> section, or adding it manually to your index.html.`,
			);
		}

		if (ssc.styleSheet.server) {
			// Effects never run during SSR: render the styles now so they reach
			// octane's css channel for this request.
			renderStyles(instance, props, ssc.styleSheet, theme, ssc.stylis);
			// No cleanup runs on the server either — drop the instance cache so
			// it cannot grow across requests.
			globalStyle.instanceRules.delete(instance);
			return null;
		}

		// Split into two effects so cleanup (removeStyles → full rebuildGroup) only
		// fires on actual unmount or sheet/globalStyle swap -- NOT on every prop change.
		//
		// For dynamic globals, `props` is a new reference every render, so the render
		// effect re-runs each render and renderStyles' rulesEqual fast-path skips
		// rebuildGroup when the CSS is unchanged.
		//
		// globalStyle is included in render deps so HMR-induced module re-evaluation
		// (which creates a new GlobalStyle instance) triggers effect re-run.
		const renderDeps = globalStyle.isStatic
			? [instance, ssc.styleSheet, globalStyle]
			: [instance, props, ssc.styleSheet, theme, ssc.stylis, globalStyle];

		const prevGlobalStyleRef = useRef(globalStyle, SLOT_GS_PREV);

		useLayoutEffect(
			() => {
				// HMR creates a new globalStyle instance but the componentId stays
				// stable, so stale hasNameForId hits skip injection.
				if (prevGlobalStyleRef.current !== globalStyle) {
					ssc.styleSheet.clearRules(styledComponentId);
					prevGlobalStyleRef.current = globalStyle;
				}

				renderStyles(instance, props, ssc.styleSheet, theme, ssc.stylis);
				// Adopt-by-replacement of the SSR css-channel tags for this component:
				// the equivalent rules are now live in the client engine, and this
				// effect is synchronous pre-paint, so there is no unstyled flash.
				removeServerGlobalTags(styledComponentId);
			},
			renderDeps,
			SLOT_GS_UPDATE,
		);

		// Cleanup-only effect: fires on unmount, sheet swap, or HMR globalStyle
		// swap. Closure captures the specific globalStyle/sheet that owned this
		// instance's rules so HMR cleanup targets the prior module's state.
		useLayoutEffect(
			() => {
				return () => {
					globalStyle.removeStyles(instance, ssc.styleSheet);
				};
			},
			[instance, ssc.styleSheet, globalStyle],
			SLOT_GS_CLEANUP,
		);

		return null;
	};

	function renderStyles(
		instance: number,
		props: ExecutionProps,
		styleSheet: StyleSheet,
		theme: DefaultTheme | undefined,
		stylis: Stringifier,
	) {
		if (globalStyle.isStatic) {
			globalStyle.renderStyles(
				instance,
				STATIC_EXECUTION_CONTEXT as unknown as ExecutionContext & Props,
				styleSheet,
				stylis,
			);
		} else {
			const context = {
				...props,
				theme: determineTheme(props, theme, (GlobalStyleComponent as any).defaultProps),
			} as ExecutionContext & Props;

			globalStyle.renderStyles(instance, context, styleSheet, stylis);
		}
	}

	return memo(GlobalStyleComponent as any);
}
