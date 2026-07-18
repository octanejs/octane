// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/listbox/utils.ts).
// octane adaptations: `ListState` type from the ported stately list state (upstream:
// 'react-stately/useListState').
import type { Key } from '@react-types/shared';
import type { ListState } from '../stately/list/useListState';

interface ListData {
	id?: string;
	shouldSelectOnPressUp?: boolean;
	shouldFocusOnHover?: boolean;
	shouldUseVirtualFocus?: boolean;
	isVirtualized?: boolean;
	onAction?: (key: Key) => void;
	linkBehavior?: 'action' | 'selection' | 'override';
}

export const listData: WeakMap<ListState<unknown>, ListData> = new WeakMap<
	ListState<unknown>,
	ListData
>();

function normalizeKey(key: Key): string {
	if (typeof key === 'string') {
		return key.replace(/\s*/g, '');
	}

	return '' + key;
}

export function getItemId<T>(state: ListState<T>, itemKey: Key): string {
	let data = listData.get(state);

	if (!data) {
		throw new Error('Unknown list');
	}

	return `${data.id}-option-${normalizeKey(itemKey)}`;
}
