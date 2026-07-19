// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Group.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// HTMLAttributes prop bag → a structural record.
import type { AriaLabelingProps, DOMProps } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import { useFocusRing } from '../focus/useFocusRing';
import { type HoverProps, useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { mergeProps } from '../utils/mergeProps';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

export interface GroupRenderProps {
	/**
	 * Whether the group is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether an element within the group is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focus-within]
	 */
	isFocusWithin: boolean;
	/**
	 * Whether an element within the group is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the group is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the group is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
}

export interface GroupProps
	extends
		AriaLabelingProps,
		Omit<HTMLAttributes, 'children' | 'className' | 'style' | 'render' | 'role' | 'slot'>,
		DOMProps,
		HoverProps,
		RenderProps<GroupRenderProps>,
		SlotProps {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Group'
	 */
	className?: ClassNameOrFunction<GroupRenderProps>;
	/** Whether the group is disabled. */
	isDisabled?: boolean;
	/** Whether the group is invalid. */
	isInvalid?: boolean;
	/** Whether the group is read only. */
	isReadOnly?: boolean;
	/**
	 * An accessibility role for the group. By default, this is set to `'group'`.
	 * Use `'region'` when the contents of the group is important enough to be
	 * included in the page table of contents. Use `'presentation'` if the group
	 * is visual only and does not represent a semantic grouping of controls.
	 *
	 * @default 'group'
	 */
	role?: 'group' | 'region' | 'presentation';
}

export const GroupContext = createContext<ContextValue<GroupProps, HTMLDivElement>>({});

/**
 * A group represents a set of related UI controls, and supports interactive states for styling.
 */
export function Group(props: GroupProps): any {
	const slot = S('Group');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, GroupContext, subSlot(slot, 'ctx'));
	let {
		isDisabled,
		isInvalid,
		isReadOnly,
		onHoverStart,
		onHoverChange,
		onHoverEnd,
		...otherProps
	} = props;
	isDisabled ??= !!props['aria-disabled'] && props['aria-disabled'] !== 'false';
	isInvalid ??= !!props['aria-invalid'] && props['aria-invalid'] !== 'false';

	let { hoverProps, isHovered } = useHover(
		{ onHoverStart, onHoverChange, onHoverEnd, isDisabled },
		subSlot(slot, 'hover'),
	);
	let { isFocused, isFocusVisible, focusProps } = useFocusRing(
		{
			within: true,
		},
		subSlot(slot, 'focusRing'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			values: { isHovered, isFocusWithin: isFocused, isFocusVisible, isDisabled, isInvalid },
			defaultClassName: 'react-aria-Group',
		},
		subSlot(slot, 'render'),
	);

	return createElement(dom.div, {
		...mergeProps(otherProps, focusProps, hoverProps),
		...renderProps,
		ref,
		role: props.role ?? 'group',
		slot: props.slot ?? undefined,
		'data-focus-within': isFocused || undefined,
		'data-hovered': isHovered || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		'data-disabled': isDisabled || undefined,
		'data-invalid': isInvalid || undefined,
		'data-readonly': isReadOnly || undefined,
		children: renderProps.children,
	});
}
