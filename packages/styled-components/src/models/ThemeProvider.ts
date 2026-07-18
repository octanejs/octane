// Ported from styled-components 6.4.3 (MIT), adapted for octane: contexts are
// provided through `createElement(Ctx.Provider, …)` descriptors (works on both
// the client and server runtimes), and the Consumer components are hand-built
// because octane's React-19-shaped contexts have no `.Consumer`.
import { createContext, createElement, isChildrenBlock, useContext, useMemo } from 'octane';

import styledError from '../utils/error';
import isFunction from '../utils/isFunction';

// Helper type for the `DefaultTheme` interface that enforces an object type & exclusively allows
// for typed keys.
type DefaultThemeAsObject<T = object> = Record<keyof T, any>;

/**
 * Override DefaultTheme to get accurate typings for your project.
 *
 * ```
 * // create styled-components.d.ts in your project source
 * // if it isn't being picked up, check tsconfig compilerOptions.types
 * import Theme from './theme';
 *
 * type ThemeType = typeof Theme;
 *
 * declare module '@octanejs/styled-components' {
 *  export interface DefaultTheme extends ThemeType {}
 * }
 * ```
 */
export interface DefaultTheme extends DefaultThemeAsObject {}

type ThemeFn = (outerTheme?: DefaultTheme | undefined) => DefaultTheme;
type ThemeArgument = DefaultTheme | ThemeFn;

type Props = {
	children?: any;
	theme: ThemeArgument;
};

const SLOT_THEME_MEMO = Symbol.for('@octanejs/styled-components:theme-memo');

export const ThemeContext = createContext<DefaultTheme | undefined>(undefined);

/**
 * Upstream's `ThemeContext.Consumer` as a component: expects a single function
 * child which is called with the current theme.
 */
export function ThemeConsumer(props: { children?: any }): unknown {
	const theme = useContext(ThemeContext);
	const render = props.children;

	if (isFunction(render) && !isChildrenBlock(render)) {
		return (render as (theme?: DefaultTheme | undefined) => unknown)(theme);
	}

	if (process.env.NODE_ENV !== 'production' && render != null) {
		console.warn('ThemeConsumer expects a single function child which receives the theme.');
	}

	return null;
}

function mergeTheme(theme: ThemeArgument, outerTheme?: DefaultTheme | undefined): DefaultTheme {
	if (!theme) {
		throw styledError(14);
	}

	if (isFunction(theme)) {
		const themeFn = theme as ThemeFn;
		const mergedTheme = themeFn(outerTheme);

		if (
			process.env.NODE_ENV !== 'production' &&
			(mergedTheme === null || Array.isArray(mergedTheme) || typeof mergedTheme !== 'object')
		) {
			throw styledError(7);
		}

		return mergedTheme;
	}

	if (Array.isArray(theme) || typeof theme !== 'object') {
		throw styledError(8);
	}

	return outerTheme ? { ...outerTheme, ...theme } : theme;
}

/**
 * Returns the current theme (as provided by the closest ancestor `ThemeProvider`.)
 *
 * If no `ThemeProvider` is found, the function will error. If you need access to the theme in an
 * uncertain composition scenario, `useContext(ThemeContext)` will not emit an error if there
 * is no `ThemeProvider` ancestor.
 */
export function useTheme(): DefaultTheme {
	const theme = useContext(ThemeContext);

	if (!theme) {
		throw styledError(18);
	}

	return theme;
}

/**
 * Provide a theme to an entire octane component tree via context
 */
export default function ThemeProvider(props: Props): unknown {
	const outerTheme = useContext(ThemeContext);
	const themeContext = useMemo(
		() => mergeTheme(props.theme, outerTheme),
		[props.theme, outerTheme],
		SLOT_THEME_MEMO,
	);

	if (!props.children) {
		return null;
	}

	return createElement(ThemeContext.Provider as any, {
		value: themeContext,
		children: props.children,
	});
}
