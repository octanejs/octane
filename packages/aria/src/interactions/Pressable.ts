// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/Pressable.tsx).
// octane adaptations: `forwardRef` becomes ref-as-prop; `React.Children.only` /
// `cloneElement` are octane's descriptor-based equivalents, so the child must be an
// element DESCRIPTOR (prop-position JSX, `createElement`, or a `.map()` result — the
// same contract as radix `Slot`). The upstream effect body is entirely dev-only
// console warnings and is not ported (repo policy).
import type { FocusableElement } from '@react-types/shared';
import { Children, cloneElement } from 'octane';

import { S, subSlot } from '../internal';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs, type MergableRef } from '../utils/mergeRefs';
import { useObjectRef } from '../utils/useObjectRef';
import { usePress, type PressProps } from './usePress';
import { useFocusable } from './useFocusable';

export interface PressableProps extends PressProps {
	/** The single element-descriptor child the press behavior is projected onto. */
	children: any;
	ref?: MergableRef<FocusableElement>;
}

export function Pressable(props: PressableProps): any {
	const slot = S('Pressable');
	const { children, ref: forwardedRef, ...rest } = props;
	const ref = useObjectRef<FocusableElement>(forwardedRef, subSlot(slot, 'ref'));
	const { pressProps } = usePress({ ...rest, ref }, subSlot(slot, 'press'));
	const { focusableProps } = useFocusable(rest, ref, subSlot(slot, 'focusable'));
	const child = Children.only(children);

	const childRef = (child as any).props?.ref;

	return cloneElement(child, {
		...mergeProps(pressProps, focusableProps, (child as any).props),
		ref: mergeRefs(childRef, ref),
	});
}
