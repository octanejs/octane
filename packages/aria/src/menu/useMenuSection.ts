// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/menu/useMenuSection.ts).
// octane adaptations: `ReactNode` heading → `any` (octane descriptors); `DOMAttributes` is
// a local structural prop-bag alias; public-hook slot threading (splitSlot/subSlot) per the
// binding convention.
import { useId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaMenuSectionProps {
	/** The heading for the section. */
	heading?: any;
	/** An accessibility label for the section. Required if `heading` is not present. */
	'aria-label'?: string;
}

export interface MenuSectionAria {
	/** Props for the wrapper list item. */
	itemProps: DOMAttributes;

	/** Props for the heading element, if any. */
	headingProps: DOMAttributes;

	/** Props for the group element. */
	groupProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a section in a menu.
 * See `useMenu` for more details about menus.
 *
 * @param props - Props for the section.
 */
export function useMenuSection(props: AriaMenuSectionProps): MenuSectionAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useMenuSection(
	props: AriaMenuSectionProps,
	slot: symbol | undefined,
): MenuSectionAria;
export function useMenuSection(...args: any[]): MenuSectionAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMenuSection');
	const props = user[0] as AriaMenuSectionProps;

	let { heading, 'aria-label': ariaLabel } = props;
	let headingId = useId(subSlot(slot, 'headingId'));

	return {
		itemProps: {
			role: 'presentation',
		},
		headingProps: heading
			? {
					// Techincally, menus cannot contain headings according to ARIA.
					// We hide the heading from assistive technology, using role="presentation",
					// and only use it as a label for the nested group.
					id: headingId,
					role: 'presentation',
				}
			: {},
		groupProps: {
			role: 'group',
			'aria-label': ariaLabel,
			'aria-labelledby': heading ? headingId : undefined,
		},
	};
}
