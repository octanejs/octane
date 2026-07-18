// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/listbox/useListBoxSection.ts).
// octane adaptations: `ReactNode` heading → `any` (octane descriptors); the heading's
// `onMouseDown` receives the NATIVE MouseEvent; `DOMAttributes` is a local structural
// prop-bag alias; public-hook slot threading (splitSlot/subSlot) per the binding convention.
import { useId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaListBoxSectionProps {
	/** The heading for the section. */
	heading?: any;
	/** An accessibility label for the section. Required if `heading` is not present. */
	'aria-label'?: string;
}

export interface ListBoxSectionAria {
	/** Props for the wrapper list item. */
	itemProps: DOMAttributes;

	/** Props for the heading element, if any. */
	headingProps: DOMAttributes;

	/** Props for the group element. */
	groupProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a section in a listbox.
 * See `useListBox` for more details about listboxes.
 *
 * @param props - Props for the section.
 */
export function useListBoxSection(props: AriaListBoxSectionProps): ListBoxSectionAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useListBoxSection(
	props: AriaListBoxSectionProps,
	slot: symbol | undefined,
): ListBoxSectionAria;
export function useListBoxSection(...args: any[]): ListBoxSectionAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useListBoxSection');
	const props = user[0] as AriaListBoxSectionProps;

	let { heading, 'aria-label': ariaLabel } = props;
	let headingId = useId(subSlot(slot, 'headingId'));

	return {
		itemProps: {
			role: 'presentation',
		},
		headingProps: heading
			? {
					// Technically, listbox cannot contain headings according to ARIA.
					// We hide the heading from assistive technology, using role="presentation",
					// and only use it as a visual label for the nested group.
					id: headingId,
					role: 'presentation',
					onMouseDown: (e: MouseEvent) => {
						// Prevent DOM focus from moving on mouse down when using virtual focus
						e.preventDefault();
					},
				}
			: {},
		groupProps: {
			role: 'group',
			'aria-label': ariaLabel,
			'aria-labelledby': heading ? headingId : undefined,
		},
	};
}
