// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/focus/FocusRing.tsx).
// octane adaptations:
// - Built with octane's `Children`/`cloneElement` over element DESCRIPTORS (prop-position
//   JSX / createElement results); a single-element array unwraps before `Children.only`,
//   per the binding's children convention (see interactions/useFocusable.ts Focusable).
// - `React.ReactElement` types → `any` (octane descriptors); component slot via S().
// - `clsx` stays (upstream dependency); the merged `className` composes through
//   `mergeProps` exactly like upstream.

import clsx from 'clsx';
import { Children, cloneElement } from 'octane';

import { S, subSlot } from '../internal';
import { mergeProps } from '../utils/mergeProps';
import { useFocusRing } from './useFocusRing';

export interface FocusRingProps {
	/** Child element to apply CSS classes to. */
	children: any;
	/** CSS class to apply when the element is focused. */
	focusClass?: string;
	/** CSS class to apply when the element has keyboard focus. */
	focusRingClass?: string;
	/**
	 * Whether to show the focus ring when something
	 * inside the container element has focus (true), or
	 * only if the container itself has focus (false).
	 *
	 * @default false
	 */
	within?: boolean;
	/** Whether the element is a text input. */
	isTextInput?: boolean;
	/** Whether the element will be auto focused. */
	autoFocus?: boolean;
}

/**
 * A utility component that applies a CSS class when an element has keyboard focus.
 * Focus rings are visible only when the user is interacting with a keyboard,
 * not with a mouse, touch, or other input methods.
 */
export function FocusRing(props: FocusRingProps): any {
	const slot = S('FocusRing');
	let { children, focusClass, focusRingClass } = props;
	let { isFocused, isFocusVisible, focusProps } = useFocusRing(props, subSlot(slot, 'ring'));

	// octane adaptation: children arrive as descriptors; a single-element array unwraps
	// (octane convention — see interactions/useFocusable.ts Focusable).
	let target: any = children;
	if (Array.isArray(children)) {
		const arr = Children.toArray(children);
		if (arr.length === 1) {
			target = arr[0];
		}
	}
	let child: any = Children.only(target);

	return cloneElement(
		child,
		mergeProps(child.props as any, {
			...focusProps,
			className: clsx({
				[focusClass || '']: isFocused,
				[focusRingClass || '']: isFocusVisible,
			}),
		}),
	);
}
