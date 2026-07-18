// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/breadcrumbs/useBreadcrumbItem.ts).
// octane adaptations: React's `ReactNode` children type → `any` (octane renderables);
// `DOMAttributes` is a local structural prop-bag alias; public-hook slot threading.
import { AriaLinkProps, useLink } from '../link/useLink';
import type { DOMProps, FocusableElement, LinkDOMProps, RefObject } from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface BreadcrumbItemProps extends AriaLinkProps, LinkDOMProps {
	/** Whether the breadcrumb item represents the current page. */
	isCurrent?: boolean;
	/**
	 * The type of current location the breadcrumb item represents, if `isCurrent` is true.
	 *
	 * @default 'page'
	 */
	'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean | 'true' | 'false';
	/** Whether the breadcrumb item is disabled. */
	isDisabled?: boolean;
	/** The contents of the breadcrumb item. */
	children: any;
}

export interface AriaBreadcrumbItemProps extends BreadcrumbItemProps, DOMProps {
	/**
	 * The HTML element used to render the breadcrumb link, e.g. 'a', or 'span'.
	 *
	 * @default 'a'
	 */
	elementType?: string;
}

export interface BreadcrumbItemAria {
	/** Props for the breadcrumb item link element. */
	itemProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for an in a breadcrumbs component.
 * See `useBreadcrumbs` for details about breadcrumbs.
 */
export function useBreadcrumbItem(
	props: AriaBreadcrumbItemProps,
	ref: RefObject<FocusableElement | null>,
): BreadcrumbItemAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useBreadcrumbItem(
	props: AriaBreadcrumbItemProps,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): BreadcrumbItemAria;
export function useBreadcrumbItem(...args: any[]): BreadcrumbItemAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useBreadcrumbItem');
	const props = user[0] as AriaBreadcrumbItemProps;
	const ref = user[1] as RefObject<FocusableElement | null>;

	let {
		isCurrent,
		isDisabled,
		'aria-current': ariaCurrent,
		elementType = 'a',
		...otherProps
	} = props;

	let { linkProps } = useLink(
		{ isDisabled: isDisabled || isCurrent, elementType, ...otherProps },
		ref,
		subSlot(slot, 'link'),
	);
	let isHeading = /^h[1-6]$/.test(elementType);
	let itemProps: DOMAttributes = {};

	if (!isHeading) {
		itemProps = linkProps;
	}

	if (isCurrent) {
		itemProps['aria-current'] = ariaCurrent || 'page';
		// isCurrent sets isDisabled === true for the current item,
		// so we have to restore the tabIndex in order to support autoFocus.
		itemProps.tabIndex = props.autoFocus ? -1 : undefined;
	}

	return {
		itemProps: {
			'aria-disabled': isDisabled,
			...itemProps,
		},
	};
}
