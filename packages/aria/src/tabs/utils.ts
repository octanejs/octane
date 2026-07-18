// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tabs/utils.ts).
// octane adaptations: `TabListState` type from the ported stately tabs state (upstream:
// 'react-stately/useTabListState').
import type { Key } from '@react-types/shared';
import type { TabListState } from '../stately/tabs/useTabListState';

export const tabsIds: WeakMap<TabListState<unknown>, string> = new WeakMap<
	TabListState<unknown>,
	string
>();

export function generateId<T>(
	state: TabListState<T> | null,
	key: Key | null | undefined,
	role: string,
): string {
	if (!state) {
		// this case should only happen in the first render before the tabs are registered
		return '';
	}
	if (typeof key === 'string') {
		key = key.replace(/\s+/g, '');
	}

	let baseId = tabsIds.get(state);
	if (process.env.NODE_ENV !== 'production' && !baseId) {
		console.error(
			'There is no tab id, please check if you have rendered the tab panel before the tab list.',
		);
	}
	return `${baseId}-${role}-${key}`;
}
