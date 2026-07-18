// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/link/useLink.ts).
// octane adaptations: `FocusableProps` is the ported native-event version; the wrapped
// `onClick` receives the NATIVE MouseEvent; public-hook slot threading per convention.
import type {
	AriaLabelingProps,
	FocusableElement,
	LinkDOMProps,
	PressEvents,
	RefObject,
} from '@react-types/shared';

// octane adaptation: structural prop bag (upstream's DOMAttributes drags React handler
// types; the wrapped onClick is a native MouseEvent handler).
type DOMAttributes = Record<string, any>;

import type { FocusableProps } from '../interactions/useFocusable';
import { S, splitSlot, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { handleLinkClick, useLinkProps, useRouter } from '../utils/openLink';
import { mergeProps } from '../utils/mergeProps';
import { useFocusable } from '../interactions/useFocusable';
import { usePress } from '../interactions/usePress';

export interface LinkProps extends Omit<PressEvents, 'onClick'>, FocusableProps {}

export interface AriaLinkProps extends LinkProps, LinkDOMProps, AriaLabelingProps {}

export interface AriaLinkOptions extends AriaLinkProps {
	/** Whether the link is disabled. */
	isDisabled?: boolean;
	/**
	 * The HTML element used to render the link, e.g. 'a', or 'span'.
	 *
	 * @default 'a'
	 */
	elementType?: string;
	/** Handler called on the native click event (octane native MouseEvent). */
	onClick?: (e: MouseEvent) => void;
}

export interface LinkAria {
	/** Props for the link element. */
	linkProps: DOMAttributes;
	/** Whether the link is currently pressed. */
	isPressed: boolean;
}

export function useLink(props: AriaLinkOptions, ref: RefObject<FocusableElement | null>): LinkAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useLink(
	props: AriaLinkOptions,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): LinkAria;
export function useLink(...args: any[]): LinkAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useLink');
	const props = user[0] as AriaLinkOptions;
	const ref = user[1] as RefObject<FocusableElement | null>;

	let {
		elementType = 'a',
		onPress,
		onPressStart,
		onPressEnd,
		onClick,
		isDisabled,
		...otherProps
	} = props;

	let linkProps: DOMAttributes = {};
	if (elementType !== 'a') {
		linkProps = {
			role: 'link',
			tabIndex: !isDisabled ? 0 : undefined,
		};
	}
	let { focusableProps } = useFocusable(props, ref, subSlot(slot, 'focusable'));
	let { pressProps, isPressed } = usePress(
		{
			onPress,
			onPressStart,
			onPressEnd,
			onClick,
			isDisabled,
			ref,
		},
		subSlot(slot, 'press'),
	);
	let domProps = filterDOMProps(otherProps as any, { labelable: true });
	let interactionHandlers = mergeProps(focusableProps, pressProps);
	let router = useRouter();
	let routerLinkProps = useLinkProps(props);

	return {
		isPressed, // Used to indicate press state for visual
		linkProps: mergeProps(domProps, routerLinkProps, {
			...interactionHandlers,
			...linkProps,
			'aria-disabled': isDisabled || undefined,
			'aria-current': (props as any)['aria-current'],
			onClick: (e: MouseEvent) => {
				(pressProps as any).onClick?.(e);
				handleLinkClick(e, router, props.href, props.routerOptions);
			},
		}),
	};
}
