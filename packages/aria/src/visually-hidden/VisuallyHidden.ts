// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/visually-hidden/VisuallyHidden.tsx).
// octane adaptations: the component is built with `createElement` (elementType may be a
// tag string or an octane component); React's CSSProperties → a structural style object;
// public-hook slot threading.
import type { DOMAttributes } from '@react-types/shared';
import { createElement, useMemo, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { mergeProps } from '../utils/mergeProps';
import { useFocusWithin } from '../interactions/useFocusWithin';

export interface VisuallyHiddenProps extends DOMAttributes {
	/** The content to visually hide. */
	children?: any;

	/**
	 * The element type for the container.
	 *
	 * @default 'div'
	 */
	elementType?: string | ((props: any) => any);

	/** Whether the element should become visible on focus, for example skip links. */
	isFocusable?: boolean;

	style?: Record<string, any>;
}

const styles: Record<string, any> = {
	border: 0,
	clip: 'rect(0 0 0 0)',
	clipPath: 'inset(50%)',
	height: '1px',
	margin: '-1px',
	overflow: 'hidden',
	padding: 0,
	position: 'absolute',
	width: '1px',
	whiteSpace: 'nowrap',
};

export interface VisuallyHiddenAria {
	visuallyHiddenProps: DOMAttributes;
}

export function useVisuallyHidden(props?: VisuallyHiddenProps): VisuallyHiddenAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useVisuallyHidden(
	props: VisuallyHiddenProps | undefined,
	slot: symbol | undefined,
): VisuallyHiddenAria;
export function useVisuallyHidden(...args: any[]): VisuallyHiddenAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useVisuallyHidden');
	const props = (user[0] as VisuallyHiddenProps | undefined) ?? {};

	let { style, isFocusable } = props;

	let [isFocused, setFocused] = useState(false, subSlot(slot, 'focused'));
	let { focusWithinProps } = useFocusWithin(
		{
			isDisabled: !isFocusable,
			onFocusWithinChange: (val: boolean) => setFocused(val),
		},
		subSlot(slot, 'focusWithin'),
	);

	// If focused, don't hide the element.
	let combinedStyles = useMemo(
		() => {
			if (isFocused) {
				return style;
			} else if (style) {
				return { ...styles, ...style };
			} else {
				return styles;
			}
		},
		[isFocused],
		subSlot(slot, 'styles'),
	);

	return {
		visuallyHiddenProps: {
			...focusWithinProps,
			style: combinedStyles,
		} as DOMAttributes,
	};
}

export function VisuallyHidden(props: VisuallyHiddenProps): any {
	let { children, elementType: Element = 'div', isFocusable, style, ...otherProps } = props;
	let { visuallyHiddenProps } = useVisuallyHidden(props, S('VisuallyHidden'));

	return createElement(
		Element as any,
		mergeProps(otherProps, visuallyHiddenProps as any),
		children,
	);
}
