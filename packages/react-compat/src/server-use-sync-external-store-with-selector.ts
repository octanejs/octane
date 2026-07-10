import { useMemo, useSyncExternalStore } from './server-shim.js';

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: (() => Snapshot) | undefined,
	selector: (snapshot: Snapshot) => Selection,
	_isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
	const getSelection = useMemo(() => () => selector(getSnapshot()), [getSnapshot, selector]);
	const getServerSelection = useMemo(
		() => (getServerSnapshot ? () => selector(getServerSnapshot()) : undefined),
		[getServerSnapshot, selector],
	);
	return useSyncExternalStore(subscribe, getSelection, getServerSelection);
}
