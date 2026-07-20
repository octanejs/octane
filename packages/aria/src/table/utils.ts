// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/utils.ts).
// octane adaptations: `TableState` type comes from the ported stately table hook.
import type { Key } from '@react-types/shared';
import type { TableState } from '../stately/table/useTableState';

export const gridIds: WeakMap<TableState<unknown>, string> = new WeakMap<
	TableState<unknown>,
	string
>();

function normalizeKey(key: Key): string {
	if (typeof key === 'string') {
		return key.replace(/\s*/g, '');
	}

	return '' + key;
}

export function getColumnHeaderId<T>(state: TableState<T>, columnKey: Key): string {
	let gridId = gridIds.get(state);
	if (!gridId) {
		throw new Error('Unknown grid');
	}

	return `${gridId}-${normalizeKey(columnKey)}`;
}

export function getCellId<T>(state: TableState<T>, rowKey: Key, columnKey: Key): string {
	let gridId = gridIds.get(state);
	if (!gridId) {
		throw new Error('Unknown grid');
	}

	return `${gridId}-${normalizeKey(rowKey)}-${normalizeKey(columnKey)}`;
}

export function getRowLabelledBy<T>(state: TableState<T>, rowKey: Key): string {
	// A row is labelled by it's row headers.
	return [...state.collection.rowHeaderColumnKeys]
		.map((columnKey) => getCellId(state, rowKey, columnKey))
		.join(' ');
}
