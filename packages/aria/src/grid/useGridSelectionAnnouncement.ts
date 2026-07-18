// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/grid/useGridSelectionAnnouncement.ts).
// GRID SUBSET: only the grid-area hooks that the gridlist area actually imports are
// ported (this file, useHighlightSelectionDescription, useGridSelectionCheckbox) — the
// rest of the grid area (useGrid/useGridRow/useGridCell/GridKeyboardDelegate/…) is out
// of scope until a table/grid port needs it.
// octane adaptations:
// - `SelectionManager` comes from the ported stately selection engine.
// - The Parcel glob intl import becomes the generated src/intl/grid index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import { announce } from '../live-announcer/LiveAnnouncer';
import type { Collection, Key, Node, Selection } from '@react-types/shared';
import intlMessages from '../intl/grid';
import type { SelectionManager } from '../stately/selection/SelectionManager';
import { useCallback, useRef } from 'octane';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useUpdateEffect } from '../utils/useUpdateEffect';

import { S, splitSlot, subSlot } from '../internal';

export interface GridSelectionAnnouncementProps {
	/**
	 * A function that returns the text that should be announced by assistive technology when a row is
	 * added or removed from selection.
	 *
	 * @default (key) => state.collection.getItem(key)?.textValue
	 */
	getRowText?: (key: Key) => string;
}

interface GridSelectionState<T> {
	/** A collection of items in the grid. */
	collection: Collection<Node<T>>;
	/** A set of items that are disabled. */
	disabledKeys: Set<Key>;
	/** A selection manager to read and update multiple selection state. */
	selectionManager: SelectionManager;
}

export function useGridSelectionAnnouncement<T>(
	props: GridSelectionAnnouncementProps,
	state: GridSelectionState<T>,
): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridSelectionAnnouncement<T>(
	props: GridSelectionAnnouncementProps,
	state: GridSelectionState<T>,
	slot: symbol | undefined,
): void;
export function useGridSelectionAnnouncement(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridSelectionAnnouncement');
	const props = user[0] as GridSelectionAnnouncementProps;
	const state = user[1] as GridSelectionState<any>;

	let {
		getRowText = (key) =>
			(state.collection as any).getTextValue?.(key) ?? state.collection.getItem(key)?.textValue,
	} = props;
	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/grid',
		subSlot(slot, 'strings'),
	);

	// Many screen readers do not announce when items in a grid are selected/deselected.
	// We do this using an ARIA live region.
	let selection = state.selectionManager.rawSelection;
	let lastSelection = useRef(selection, subSlot(slot, 'lastSelection'));
	let announceSelectionChange = useCallback(
		() => {
			if (!state.selectionManager.isFocused || selection === lastSelection.current) {
				lastSelection.current = selection;

				return;
			}

			let addedKeys = diffSelection(selection, lastSelection.current);
			let removedKeys = diffSelection(lastSelection.current, selection);

			// If adding or removing a single row from the selection, announce the name of that item.
			let isReplace = state.selectionManager.selectionBehavior === 'replace';
			let messages: string[] = [];

			if (state.selectionManager.selectedKeys.size === 1 && isReplace) {
				let firstKey = state.selectionManager.selectedKeys.keys().next().value;
				if (firstKey != null && state.collection.getItem(firstKey)) {
					let currentSelectionText = getRowText(firstKey);
					if (currentSelectionText) {
						messages.push(stringFormatter.format('selectedItem', { item: currentSelectionText }));
					}
				}
			} else if (addedKeys.size === 1 && removedKeys.size === 0) {
				let firstKey = addedKeys.keys().next().value;
				if (firstKey != null) {
					let addedText = getRowText(firstKey);
					if (addedText) {
						messages.push(stringFormatter.format('selectedItem', { item: addedText }));
					}
				}
			} else if (removedKeys.size === 1 && addedKeys.size === 0) {
				let firstKey = removedKeys.keys().next().value;
				if (firstKey != null && state.collection.getItem(firstKey)) {
					let removedText = getRowText(firstKey);
					if (removedText) {
						messages.push(stringFormatter.format('deselectedItem', { item: removedText }));
					}
				}
			}

			// Announce how many items are selected, except when selecting the first item.
			if (state.selectionManager.selectionMode === 'multiple') {
				if (
					messages.length === 0 ||
					selection === 'all' ||
					selection.size > 1 ||
					lastSelection.current === 'all' ||
					(lastSelection.current as any)?.size > 1
				) {
					messages.push(
						selection === 'all'
							? stringFormatter.format('selectedAll')
							: stringFormatter.format('selectedCount', { count: selection.size }),
					);
				}
			}

			if (messages.length > 0) {
				announce(messages.join(' '));
			}

			lastSelection.current = selection;
		},
		[
			selection,
			state.selectionManager.selectedKeys,
			state.selectionManager.isFocused,
			state.selectionManager.selectionBehavior,
			state.selectionManager.selectionMode,
			state.collection,
			getRowText,
			stringFormatter,
		],
		subSlot(slot, 'announceChange'),
	);

	// useUpdateEffect will handle using useEffectEvent, no need to stabilize anything on this end
	useUpdateEffect(
		() => {
			if (state.selectionManager.isFocused) {
				announceSelectionChange();
			} else {
				// Wait a frame in case the collection is about to become focused (e.g. on mouse down).
				let raf = requestAnimationFrame(announceSelectionChange);
				return () => cancelAnimationFrame(raf);
			}
		},
		[selection, state.selectionManager.isFocused],
		subSlot(slot, 'updateFx'),
	);
}

function diffSelection(a: Selection, b: Selection): Set<Key> {
	let res = new Set<Key>();
	if (a === 'all' || b === 'all') {
		return res;
	}

	for (let key of a.keys()) {
		if (!b.has(key)) {
			res.add(key);
		}
	}

	return res;
}
