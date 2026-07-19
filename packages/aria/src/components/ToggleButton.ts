// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/ToggleButton.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention. Upstream's
// conditional group-item/standalone hook calls (eslint-disabled there) are safe here because
// binding hooks are keyed by their explicit slot symbols, not call order.
import type { HoverEvents, Key } from '@react-types/shared';
import { createContext, createElement, useContext } from 'octane';

import { type AriaToggleButtonProps, useToggleButton } from '../button/useToggleButton';
import { useToggleButtonGroupItem } from '../button/useToggleButtonGroup';
import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { type ToggleState, useToggleState } from '../stately/toggle/useToggleState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import type { ButtonRenderProps } from './Button';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { ToggleGroupStateContext } from './ToggleButtonGroup';
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

export interface ToggleButtonRenderProps extends Omit<ButtonRenderProps, 'isPending'> {
	/**
	 * Whether the button is currently selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * State of the toggle button.
	 */
	state: ToggleState;
}

export interface ToggleButtonProps
	extends
		Omit<AriaToggleButtonProps, 'children' | 'elementType' | 'id'>,
		HoverEvents,
		SlotProps,
		RenderProps<ToggleButtonRenderProps, 'button'>,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ToggleButton'
	 */
	className?: ClassNameOrFunction<ToggleButtonRenderProps>;
	/**
	 * When used in a ToggleButtonGroup, an identifier for the item in `selectedKeys`. When used
	 * standalone, a DOM id.
	 */
	id?: Key;
}

export const ToggleButtonContext = createContext<
	ContextValue<ToggleButtonProps, HTMLButtonElement>
>({});

/**
 * A toggle button allows a user to toggle a selection on or off, for example switching between two
 * states or modes.
 */
export function ToggleButton(props: ToggleButtonProps): any {
	const slot = S('ToggleButton');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, ToggleButtonContext, subSlot(slot, 'ctx'));
	let groupState = useContext(ToggleGroupStateContext);
	let state = useToggleState(
		groupState && props.id != null
			? {
					isSelected: groupState.selectedKeys.has(props.id),
					onChange(isSelected: boolean) {
						groupState.setSelected(props.id!, isSelected);
					},
				}
			: (props as any),
		subSlot(slot, 'toggle'),
	);

	let { buttonProps, isPressed, isSelected, isDisabled } =
		groupState && props.id != null
			? useToggleButtonGroupItem(
					{ ...props, id: props.id } as any,
					groupState,
					ref,
					subSlot(slot, 'groupItem'),
				)
			: useToggleButton(
					{ ...props, id: props.id != null ? String(props.id) : undefined } as any,
					state,
					ref,
					subSlot(slot, 'toggleButton'),
				);

	let { focusProps, isFocused, isFocusVisible } = useFocusRing(props, subSlot(slot, 'focusRing'));
	let { hoverProps, isHovered } = useHover({ ...props, isDisabled }, subSlot(slot, 'hover'));
	let renderProps = useRenderProps(
		{
			...props,
			id: undefined,
			values: {
				isHovered,
				isPressed,
				isFocused,
				isSelected: state.isSelected,
				isFocusVisible,
				isDisabled,
				state,
			},
			defaultClassName: 'react-aria-ToggleButton',
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props as any, { global: true });
	delete DOMProps.id;
	delete DOMProps.onClick;

	return createElement(dom.button, {
		...mergeProps(DOMProps, renderProps, buttonProps, focusProps, hoverProps),
		ref,
		slot: props.slot || undefined,
		'data-focused': isFocused || undefined,
		'data-disabled': isDisabled || undefined,
		'data-pressed': isPressed || undefined,
		'data-selected': isSelected || undefined,
		'data-hovered': isHovered || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		children: createElement(SelectionIndicatorContext.Provider, {
			value: { isSelected },
			children: renderProps.children,
		}),
	});
}
