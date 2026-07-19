// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Input.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// arrives positionally from `createHideableComponent` (which forwards `props.ref`); the
// plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// InputHTMLAttributes prop bag → a structural record. NATIVE EVENTS: this is a text control —
// per-keystroke wiring rides octane's native `onInput` (props produced by useTextField et al.
// pass through unchanged); no synthetic `onChange` is added.
import type { HoverEvents } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import { createHideableComponent } from '../collections/Hidden';
import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { mergeProps } from '../utils/mergeProps';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural prop bag (upstream extends React's InputHTMLAttributes).
type InputHTMLAttributes = Record<string, any>;

export interface InputRenderProps {
	/**
	 * Whether the input is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the input is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the input is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the input is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the input is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
}

export interface InputProps
	extends
		Omit<InputHTMLAttributes, 'className' | 'style'>,
		HoverEvents,
		StyleRenderProps<InputRenderProps, 'input'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Input'
	 */
	className?: ClassNameOrFunction<InputRenderProps>;
	/**
	 * Temporary text that occupies the text input when it is empty.
	 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/placeholder).
	 */
	placeholder?: string;
}

export const InputContext = createContext<ContextValue<InputProps, HTMLInputElement>>({});

let filterHoverProps = (props: InputProps) => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { onHoverStart, onHoverChange, onHoverEnd, ...otherProps } = props;
	return otherProps;
};

/**
 * An input allows a user to input text.
 */
export const Input = /*#__PURE__*/ createHideableComponent(function Input(
	props: InputProps,
	ref: any,
) {
	const slot = S('Input');
	[props, ref] = useContextProps(props, ref, InputContext, subSlot(slot, 'ctx'));

	let { hoverProps, isHovered } = useHover(
		{
			...props,
			isDisabled: props.disabled,
		},
		subSlot(slot, 'hover'),
	);
	let { isFocused, isFocusVisible, focusProps } = useFocusRing(
		{
			isTextInput: true,
			autoFocus: props.autoFocus,
		},
		subSlot(slot, 'focusRing'),
	);

	let isInvalid = !!props['aria-invalid'] && props['aria-invalid'] !== 'false';
	let renderProps = useRenderProps(
		{
			...props,
			values: {
				isHovered,
				isFocused,
				isFocusVisible,
				isDisabled: props.disabled || false,
				isInvalid,
			},
			defaultClassName: 'react-aria-Input',
		},
		subSlot(slot, 'render'),
	);

	return createElement(dom.input, {
		...mergeProps(filterHoverProps(props), focusProps, hoverProps),
		...renderProps,
		ref,
		'data-focused': isFocused || undefined,
		'data-disabled': props.disabled || undefined,
		'data-hovered': isHovered || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		'data-invalid': isInvalid || undefined,
	});
});
