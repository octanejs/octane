// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Button.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// arrives positionally from `createHideableComponent` (which forwards `props.ref`); the
// plain-`.ts` component uses the S()/subSlot component-slot convention; `announce` comes from
// the binding's live-announcer port; the explicit dep array on the pending-announcement effect
// is preserved verbatim.
import type { HoverEvents } from '@react-types/shared';
import { createContext, createElement, useEffect, useRef } from 'octane';

import { type AriaButtonProps, useButton } from '../button/useButton';
import { createHideableComponent } from '../collections/Hidden';
import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { announce } from '../live-announcer/LiveAnnouncer';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useId } from '../utils/useId';
import { ProgressBarContext } from './ProgressBar';
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

export interface ButtonRenderProps {
	/**
	 * Whether the button is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the button is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the button is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the button is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the button is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the button is currently in a pending state.
	 *
	 * @selector [data-pending]
	 */
	isPending: boolean;
}

export interface ButtonProps
	extends
		Omit<AriaButtonProps, 'children' | 'href' | 'target' | 'rel' | 'elementType'>,
		HoverEvents,
		SlotProps,
		RenderProps<ButtonRenderProps, 'button'>,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Button'
	 */
	className?: ClassNameOrFunction<ButtonRenderProps>;
	/**
	 * Whether the button is in a pending state. This disables press and hover events
	 * while retaining focusability, and announces the pending state to screen readers.
	 */
	isPending?: boolean;
}

interface ButtonContextValue extends ButtonProps {
	isPressed?: boolean;
}

export const ButtonContext = createContext<ContextValue<ButtonContextValue, HTMLButtonElement>>({});

/**
 * A button allows a user to perform an action, with mouse, touch, and keyboard interactions.
 */
export const Button = /*#__PURE__*/ createHideableComponent(function Button(
	props: ButtonProps,
	ref: any,
) {
	const slot = S('Button');
	[props, ref] = useContextProps(props, ref, ButtonContext, subSlot(slot, 'ctx'));
	let ctx = props as ButtonContextValue;
	let { isPending } = ctx;
	let { buttonProps, isPressed } = useButton(props, ref, subSlot(slot, 'button'));
	buttonProps = useDisableInteractions(buttonProps, isPending);
	let { focusProps, isFocused, isFocusVisible } = useFocusRing(props, subSlot(slot, 'focusRing'));
	let { hoverProps, isHovered } = useHover(
		{
			...props,
			isDisabled: props.isDisabled || isPending,
		},
		subSlot(slot, 'hover'),
	);
	let renderValues = {
		isHovered,
		isPressed: (ctx.isPressed || isPressed) && !isPending,
		isFocused,
		isFocusVisible,
		isDisabled: props.isDisabled || false,
		isPending: isPending ?? false,
	};

	let renderProps = useRenderProps(
		{
			...props,
			values: renderValues,
			defaultClassName: 'react-aria-Button',
		},
		subSlot(slot, 'render'),
	);

	let buttonId = useId(buttonProps.id, subSlot(slot, 'buttonId'));
	let progressId = useId(undefined, subSlot(slot, 'progressId'));

	let ariaLabelledby = buttonProps['aria-labelledby'];
	if (isPending) {
		// aria-labelledby wins over aria-label
		// https://www.w3.org/TR/accname-1.2/#computation-steps
		if (ariaLabelledby) {
			ariaLabelledby = `${ariaLabelledby} ${progressId}`;
		} else if (buttonProps['aria-label']) {
			ariaLabelledby = `${buttonId} ${progressId}`;
		}
	}

	let wasPending = useRef(isPending, subSlot(slot, 'wasPending'));
	useEffect(
		() => {
			let message = { 'aria-labelledby': ariaLabelledby || buttonId };
			if (!wasPending.current && isFocused && isPending) {
				announce(message, 'assertive');
			} else if (wasPending.current && isFocused && !isPending) {
				announce(message, 'assertive');
			}
			wasPending.current = isPending;
		},
		[isPending, isFocused, ariaLabelledby, buttonId],
		subSlot(slot, 'announce'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.onClick;

	return createElement(dom.button, {
		...mergeProps(DOMProps, renderProps, buttonProps, focusProps, hoverProps),
		// When the button is in a pending state, we want to stop implicit form submission (ie. when the user presses enter on a text input).
		// We do this by changing the button's type to button.
		type: buttonProps.type === 'submit' && isPending ? 'button' : buttonProps.type,
		id: buttonId,
		ref,
		'aria-labelledby': ariaLabelledby,
		slot: props.slot || undefined,
		'aria-disabled': isPending ? 'true' : buttonProps['aria-disabled'],
		'data-disabled': props.isDisabled || undefined,
		'data-pressed': renderValues.isPressed || undefined,
		'data-hovered': isHovered || undefined,
		'data-focused': isFocused || undefined,
		'data-pending': isPending || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		children: createElement(ProgressBarContext.Provider, {
			value: { id: progressId },
			children: renderProps.children,
		}),
	});
});

// Events to preserve when isPending is true (for tooltips and other overlays)
const PRESERVED_EVENT_PATTERN =
	/Focus|Blur|Hover|Pointer(Enter|Leave|Over|Out)|Mouse(Enter|Leave|Over|Out)/;

// Not a hook (despite the upstream name): a plain per-render prop transform.
function useDisableInteractions(props: any, isPending: boolean | undefined) {
	if (isPending) {
		for (const key in props) {
			if (key.startsWith('on') && !PRESERVED_EVENT_PATTERN.test(key)) {
				props[key] = undefined;
			}
		}
		props.href = undefined;
		props.target = undefined;
	}
	return props;
}
