// @octanejs/styled-components — styled-components 6.4.3 (MIT) ported to the
// octane renderer. The React Native surface and the RSC-only
// `stylisPluginRSC` are intentionally not ported.
import { SC_ATTR, SC_VERSION } from './constants';
import createGlobalStyle from './constructors/createGlobalStyle';
import createTheme from './constructors/createTheme';
import css from './constructors/css';
import keyframes from './constructors/keyframes';
import withTheme from './hoc/withTheme';
import ServerStyleSheet from './models/ServerStyleSheet';
import {
	IStyleSheetContext,
	IStyleSheetManager,
	IStylisContext,
	mainSheet,
	StyleSheetConsumer,
	StyleSheetContext,
	StyleSheetManager,
} from './models/StyleSheetManager';
import ThemeProvider, { ThemeConsumer, ThemeContext, useTheme } from './models/ThemeProvider';
import styled from './constructors/styled';
import isStyledComponent from './utils/isStyledComponent';

export * from './secretInternals';
export type {
	Attrs,
	BaseObject,
	CSSKeyframes,
	CSSObject,
	CSSProp,
	CSSProperties,
	CSSPropertiesWithVars,
	CSSPseudos,
	DataAttributes,
	DefaultTheme,
	Dict,
	ExecutionContext,
	ExecutionProps,
	IStyledComponent,
	IStyledComponentFactory,
	IStyledStatics,
	Interpolation,
	Keyframes,
	KnownTarget,
	PolymorphicComponent,
	PolymorphicCallProps,
	RuleSet,
	Runtime,
	ShouldForwardProp,
	StyledObject,
	StyledOptions,
	StyleFunction,
	Styles,
	StyledTarget,
	Stringifier,
	SupportedHTMLElements,
	TargetProps,
	WebTarget,
} from './types';
export type { Styled, LibraryStyled, StyledInstance } from './constructors/styled';
export type { IStyleSheetContext, IStyleSheetManager, IStylisContext };
export {
	createGlobalStyle,
	createTheme,
	css,
	isStyledComponent,
	keyframes,
	ServerStyleSheet,
	StyleSheetConsumer,
	StyleSheetContext,
	StyleSheetManager,
	styled,
	ThemeConsumer,
	ThemeContext,
	ThemeProvider,
	useTheme,
	withTheme,
};
export default styled;

export const version = SC_VERSION;

if (process.env.NODE_ENV !== 'production' && typeof navigator !== 'undefined') {
	if ((navigator as any).product === 'ReactNative') {
		console.warn(
			"It looks like you've imported '@octanejs/styled-components' on React Native.\n" +
				'The octane port only supports the web surface; the React Native runtime is not ported.',
		);
	}
}

const windowGlobalKey = `__sc-${SC_ATTR}__`;
if (
	process.env.NODE_ENV !== 'production' &&
	process.env.NODE_ENV !== 'test' &&
	typeof window !== 'undefined'
) {
	const anyWindow = window as any;
	if (!anyWindow[windowGlobalKey]) anyWindow[windowGlobalKey] = 0;

	if (anyWindow[windowGlobalKey] === 1) {
		console.warn(
			"It looks like there are several instances of 'styled-components' initialized in this application. " +
				'This may cause dynamic styles to not render properly, errors during the rehydration process, ' +
				'a missing theme prop, and makes your application bigger without good reason.\n\n' +
				'See https://styled-components.com/docs/faqs#why-am-i-getting-a-warning-about-several-instances-of-module-on-the-page for more info.',
		);
	}

	anyWindow[windowGlobalKey] += 1;
}
