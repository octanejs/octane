import { Fragment, createElement } from 'octane';
import type { JSX as ReactJSX } from 'react';
import type { OctaneNode } from 'octane';
import createThemeStyle from '../tokens/style';
import type { CSSVarStyle, VisxThemeDefinition } from '../tokens/types';
import warn from '../utils/warn';

export type ThemeScopeElement = keyof ReactJSX.IntrinsicElements;

interface BaseThemeScopeProps {
	className?: string;
	style?: CSSVarStyle;
	children: OctaneNode;
}

interface AutoThemeScopeProps extends BaseThemeScopeProps {
	theme?: 'auto';
	as?: ThemeScopeElement | false;
}

interface EmittingThemeScopeProps extends BaseThemeScopeProps {
	theme: 'light' | 'dark' | VisxThemeDefinition;
	as?: ThemeScopeElement;
}

export type ThemeScopeProps = AutoThemeScopeProps | EmittingThemeScopeProps;

function warnInvalidFalseElement() {
	warn('[@octanejs/visx/theme] ThemeScope requires a wrapper element for non-auto themes.');
}

export default function ThemeScope({
	as,
	children,
	className,
	style,
	theme = 'auto',
}: ThemeScopeProps) {
	if (theme === 'auto') {
		if (as === false) {
			return createElement(Fragment, null, children);
		}

		const Element = as ?? 'div';

		return createElement(Element, { className, style }, children);
	}

	const Element =
		as === false ? 'div' : as ?? 'div';

	if (as === false) {
		warnInvalidFalseElement();
	}

	const generatedStyle = createThemeStyle(theme);

	return createElement(Element, { className, style: { ...generatedStyle, ...style } }, children);
}
