// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/TextArea.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// TextareaHTMLAttributes prop bag → a structural record. NATIVE EVENTS: this is a text control —
// per-keystroke wiring rides octane's native `onInput`; no synthetic `onChange` is added.
import type { HoverEvents } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { mergeProps } from '../utils/mergeProps';
import type { InputRenderProps } from './Input';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural prop bag (upstream extends React's TextareaHTMLAttributes).
type TextareaHTMLAttributes = Record<string, any>;

export interface TextAreaProps
	extends
		Omit<TextareaHTMLAttributes, 'className' | 'style'>,
		HoverEvents,
		StyleRenderProps<InputRenderProps, 'textarea'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TextArea'
	 */
	className?: ClassNameOrFunction<InputRenderProps>;
}

export const TextAreaContext = createContext<ContextValue<TextAreaProps, HTMLTextAreaElement>>({});

let filterHoverProps = (props: TextAreaProps): TextAreaProps => {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { onHoverStart, onHoverChange, onHoverEnd, ...otherProps } = props;
	return otherProps;
};

/**
 * A textarea allows a user to input mult-line text.
 */
export function TextArea(props: TextAreaProps): any {
	const slot = S('TextArea');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, TextAreaContext, subSlot(slot, 'ctx'));

	let { hoverProps, isHovered } = useHover(props, subSlot(slot, 'hover'));
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
			defaultClassName: 'react-aria-TextArea',
		},
		subSlot(slot, 'render'),
	);

	return createElement(dom.textarea, {
		...mergeProps(filterHoverProps(props), focusProps, hoverProps),
		...renderProps,
		ref,
		'data-focused': isFocused || undefined,
		'data-disabled': props.disabled || undefined,
		'data-hovered': isHovered || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		'data-invalid': isInvalid || undefined,
	});
}
