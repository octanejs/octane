// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Link.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention.
import type { DOMProps, HoverEvents } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { type AriaLinkOptions, useLink } from '../link/useLink';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type PossibleLinkDOMRenderProps,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface LinkProps
	extends
		Omit<AriaLinkOptions, 'elementType'>,
		HoverEvents,
		Omit<RenderProps<LinkRenderProps>, 'render'>,
		PossibleLinkDOMRenderProps<'span', LinkRenderProps>,
		SlotProps,
		DOMProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Link'
	 */
	className?: ClassNameOrFunction<LinkRenderProps>;
}

export interface LinkRenderProps {
	/**
	 * Whether the link is the current item within a list.
	 *
	 * @selector [data-current]
	 */
	isCurrent: boolean;
	/**
	 * Whether the link is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the link is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the link is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the link is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the link is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
}

export const LinkContext = createContext<ContextValue<LinkProps, HTMLAnchorElement>>(null);

/**
 * A link allows a user to navigate to another page or resource within a web page
 * or application.
 */
export function Link(props: LinkProps): any {
	const slot = S('Link');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, LinkContext, subSlot(slot, 'ctx'));

	let elementType = props.href && !props.isDisabled ? 'a' : 'span';
	let { linkProps, isPressed } = useLink({ ...props, elementType }, ref, subSlot(slot, 'link'));
	let ElementType = dom[elementType];

	let { hoverProps, isHovered } = useHover(props, subSlot(slot, 'hover'));
	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);

	let renderProps = useRenderProps<LinkRenderProps, 'span' | 'a'>(
		{
			...props,
			defaultClassName: 'react-aria-Link',
			values: {
				isCurrent: !!props['aria-current'],
				isDisabled: props.isDisabled || false,
				isPressed,
				isHovered,
				isFocused,
				isFocusVisible,
			},
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.onClick;

	return createElement(ElementType, {
		ref,
		slot: props.slot || undefined,
		...mergeProps(DOMProps, renderProps, linkProps, hoverProps, focusProps),
		'data-focused': isFocused || undefined,
		'data-hovered': isHovered || undefined,
		'data-pressed': isPressed || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		'data-current': !!props['aria-current'] || undefined,
		'data-disabled': props.isDisabled || undefined,
		children: renderProps.children,
	});
}
