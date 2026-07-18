// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/gridlist/utils.ts).
// octane adaptations: `ListState` type comes from the ported stately list hook.
import type { Key } from '@react-types/shared';
import type { ListState } from '../stately/list/useListState';

interface ListMapShared {
	id: string;
	onAction?: (key: Key) => void;
	linkBehavior?: 'action' | 'selection' | 'override';
	keyboardNavigationBehavior: 'arrow' | 'tab';
	shouldSelectOnPressUp?: boolean;
}

// Used to share:
// id of the list and onAction between useList, useListItem, and useListSelectionCheckbox
export const listMap: WeakMap<ListState<unknown>, ListMapShared> = new WeakMap<
	ListState<unknown>,
	ListMapShared
>();

export function getRowId<T>(state: ListState<T>, key: Key): string {
	let { id } = listMap.get(state) ?? {};
	if (!id) {
		throw new Error('Unknown list');
	}

	return `${id}-${normalizeKey(key)}`;
}

export function normalizeKey(key: Key): string {
	if (typeof key === 'string') {
		return key.replace(/\s*/g, '');
	}

	return '' + key;
}
