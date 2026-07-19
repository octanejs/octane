// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/ToggleButtonGroup.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention.
import type { Orientation } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import {
	type AriaToggleButtonGroupProps,
	useToggleButtonGroup,
} from '../button/useToggleButtonGroup';
import { S, subSlot } from '../internal';
import { type ToggleGroupState, useToggleGroupState } from '../stately/toggle/useToggleGroupState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { SharedElementTransition } from './SharedElementTransition';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface ToggleButtonGroupRenderProps {
	/**
	 * The orientation of the toggle button group.
	 *
	 * @selector [data-orientation="horizontal | vertical"]
	 */
	orientation: Orientation;
	/**
	 * Whether the toggle button group is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * State of the toggle button group.
	 */
	state: ToggleGroupState;
}

export interface ToggleButtonGroupProps
	extends
		AriaToggleButtonGroupProps,
		RenderProps<ToggleButtonGroupRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ToggleButtonGroup'
	 */
	className?: ClassNameOrFunction<ToggleButtonGroupRenderProps>;
}

export const ToggleButtonGroupContext = createContext<
	ContextValue<ToggleButtonGroupProps, HTMLDivElement>
>({});
export const ToggleGroupStateContext = createContext<ToggleGroupState | null>(null);

/**
 * A toggle button group allows a user to toggle multiple options, with single or multiple
 * selection.
 */
export function ToggleButtonGroup(props: ToggleButtonGroupProps): any {
	const slot = S('ToggleButtonGroup');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, ToggleButtonGroupContext, subSlot(slot, 'ctx'));
	let state = useToggleGroupState(props, subSlot(slot, 'state'));
	let { groupProps } = useToggleButtonGroup(props, state, ref, subSlot(slot, 'group'));

	let renderProps = useRenderProps(
		{
			...props,
			values: {
				orientation: props.orientation || 'horizontal',
				isDisabled: state.isDisabled,
				state,
			},
			defaultClassName: 'react-aria-ToggleButtonGroup',
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, groupProps),
		ref,
		slot: props.slot || undefined,
		'data-orientation': props.orientation || 'horizontal',
		'data-disabled': props.isDisabled || undefined,
		children: createElement(ToggleGroupStateContext.Provider, {
			value: state,
			children: createElement(SharedElementTransition, { children: renderProps.children }),
		}),
	});
}
