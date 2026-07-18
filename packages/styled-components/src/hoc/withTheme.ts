// Ported from styled-components 6.4.3 (MIT), adapted for octane: no
// forwardRef — the wrapper is a plain component and any `ref` prop flows
// through the spread to the wrapped component (octane refs are plain props).
import { createElement, useContext } from 'octane';

import { ThemeContext } from '../models/ThemeProvider';
import { AnyComponent, ExecutionProps } from '../types';
import determineTheme from '../utils/determineTheme';
import getComponentName from '../utils/getComponentName';
import hoist, { NonOctaneStatics } from '../utils/hoist';

/** Higher-order component that injects the current theme as a prop. Prefer `useTheme` in function components. */
export default function withTheme<T extends AnyComponent>(
	Component: T,
): ((props: ExecutionProps & { [key: string]: any }) => unknown) & NonOctaneStatics<T> {
	const WithTheme = (props: ExecutionProps & { [key: string]: any }, _scope?: any) => {
		const theme = useContext(ThemeContext);
		const themeProp = determineTheme(props, theme, (Component as any).defaultProps);

		if (process.env.NODE_ENV !== 'production' && themeProp === undefined) {
			console.warn(
				`[withTheme] You are not using a ThemeProvider nor passing a theme prop or a theme in defaultProps in component class "${getComponentName(
					Component,
				)}"`,
			);
		}

		return createElement(Component as any, {
			...props,
			theme: themeProp,
		});
	};

	WithTheme.displayName = `WithTheme(${getComponentName(Component)})`;

	return hoist(WithTheme as any, Component) as ((
		props: ExecutionProps & { [key: string]: any },
	) => unknown) &
		NonOctaneStatics<T>;
}
