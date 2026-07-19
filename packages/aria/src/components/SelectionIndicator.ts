// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/SelectionIndicator.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref on the underlying SharedElement; the plain-`.ts` component uses the S()/subSlot
// component-slot convention.
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import {
	SharedElement,
	type SharedElementPropsBase,
	type SharedElementRenderProps,
} from './SharedElementTransition';
import { type ClassNameOrFunction, type ContextValue, useContextProps } from './utils';

export interface SelectionIndicatorProps extends SharedElementPropsBase {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SelectionIndicator'
	 */
	className?: ClassNameOrFunction<SharedElementRenderProps>;
	/**
	 * Whether the SelectionIndicator is visible. This is usually set automatically by the parent
	 * component.
	 */
	isSelected?: boolean;
}

export const SelectionIndicatorContext = createContext<
	ContextValue<SelectionIndicatorProps, HTMLDivElement>
>({
	isSelected: false,
});

/**
 * An animated indicator of selection state within a group of items.
 */
export function SelectionIndicator(props: SelectionIndicatorProps): any {
	const slot = S('SelectionIndicator');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, SelectionIndicatorContext, subSlot(slot, 'ctx'));
	let { isSelected, ...otherProps } = props;
	return createElement(SharedElement, {
		...otherProps,
		ref,
		className: props.className || 'react-aria-SelectionIndicator',
		name: 'SelectionIndicator',
		isVisible: isSelected,
	});
}
