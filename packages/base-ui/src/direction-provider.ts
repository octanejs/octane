// Ported from .base-ui/packages/react/src/direction-provider/DirectionProvider.tsx (v1.6.0).
// Enables RTL behavior for Base UI components.
//
// octane adaptation: `utils/DirectionContext` carries the `TextDirection` string DIRECTLY
// rather than Base UI's `{ direction }` wrapper object, so the provider needs no `useMemo`
// to stay referentially stable. The context value is never observable in the DOM, and every
// consumer reads it through `useDirection()`.
import { createElement } from 'octane';

import { DirectionContext, useDirection } from './utils/DirectionContext';
import type { TextDirection } from './utils/DirectionContext';

export type { TextDirection };
export { useDirection };

export interface DirectionProviderProps {
	children?: any;
	/**
	 * The reading direction of the text.
	 * @default 'ltr'
	 */
	direction?: TextDirection;
}

export function DirectionProvider(props: DirectionProviderProps): any {
	const { direction = 'ltr' } = props;
	return createElement(DirectionContext.Provider, { value: direction, children: props.children });
}

export namespace DirectionProvider {
	export type Props = DirectionProviderProps;
}
