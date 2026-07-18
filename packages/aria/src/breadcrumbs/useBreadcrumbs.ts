// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/breadcrumbs/useBreadcrumbs.ts).
// octane adaptations: the Parcel glob intl import becomes the generated
// src/intl/breadcrumbs index (verbatim dictionaries); `DOMAttributes` is a local
// structural prop-bag alias; public-hook slot threading.
import type { AriaLabelingProps, DOMProps } from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import intlMessages from '../intl/breadcrumbs';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaBreadcrumbsProps extends DOMProps, AriaLabelingProps {}

export interface BreadcrumbsAria {
	/** Props for the breadcrumbs navigation element. */
	navProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a breadcrumbs component.
 * Breadcrumbs display a hierarchy of links to the current page or resource in an application.
 */
export function useBreadcrumbs(props: AriaBreadcrumbsProps): BreadcrumbsAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useBreadcrumbs(
	props: AriaBreadcrumbsProps,
	slot: symbol | undefined,
): BreadcrumbsAria;
export function useBreadcrumbs(...args: any[]): BreadcrumbsAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useBreadcrumbs');
	const props = user[0] as AriaBreadcrumbsProps;

	let { 'aria-label': ariaLabel, ...otherProps } = props;

	let strings = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/breadcrumbs',
		subSlot(slot, 'strings'),
	);
	return {
		navProps: {
			...filterDOMProps(otherProps, { labelable: true }),
			'aria-label': ariaLabel || strings.format('breadcrumbs'),
		},
	};
}
