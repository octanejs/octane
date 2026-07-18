// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/grid/useHighlightSelectionDescription.ts).
// GRID SUBSET: see useGridSelectionAnnouncement.ts — only the grid-area hooks the
// gridlist area imports are ported.
// octane adaptations:
// - `MultipleSelectionManager` comes from the ported stately selection types.
// - The Parcel glob intl import becomes the generated src/intl/grid index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import type { AriaLabelingProps } from '@react-types/shared';
import intlMessages from '../intl/grid';
import type { MultipleSelectionManager } from '../stately/selection/types';
import { useDescription } from '../utils/useDescription';
import { useInteractionModality } from '../interactions/useFocusVisible';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export interface HighlightSelectionDescriptionProps {
	selectionManager: MultipleSelectionManager;
	hasItemActions?: boolean;
}

/**
 * Computes the description for a grid selectable collection.
 *
 * @param props
 */
export function useHighlightSelectionDescription(
	props: HighlightSelectionDescriptionProps,
): AriaLabelingProps;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useHighlightSelectionDescription(
	props: HighlightSelectionDescriptionProps,
	slot: symbol | undefined,
): AriaLabelingProps;
export function useHighlightSelectionDescription(...args: any[]): AriaLabelingProps {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useHighlightSelectionDescription');
	const props = user[0] as HighlightSelectionDescriptionProps;

	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/grid',
		subSlot(slot, 'strings'),
	);
	let modality = useInteractionModality(subSlot(slot, 'modality'));
	// null is the default if the user hasn't interacted with the table at all yet or the rest of the page
	let shouldLongPress =
		(modality === 'pointer' || modality === 'virtual' || modality == null) &&
		typeof window !== 'undefined' &&
		'ontouchstart' in window;

	let interactionDescription = useMemo(
		() => {
			let selectionMode = props.selectionManager.selectionMode;
			let selectionBehavior = props.selectionManager.selectionBehavior;

			let message: string | undefined;
			if (shouldLongPress) {
				message = stringFormatter.format('longPressToSelect');
			}

			return selectionBehavior === 'replace' && selectionMode !== 'none' && props.hasItemActions
				? message
				: undefined;
		},
		[
			props.selectionManager.selectionMode,
			props.selectionManager.selectionBehavior,
			props.hasItemActions,
			stringFormatter,
			shouldLongPress,
		],
		subSlot(slot, 'description'),
	);

	let descriptionProps = useDescription(interactionDescription, subSlot(slot, 'describe'));
	return descriptionProps;
}
