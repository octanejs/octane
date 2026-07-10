import { useEffect, useMemo, useRef, useSyncExternalStore } from './shim.js';

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: (() => Snapshot) | undefined,
	selector: (snapshot: Snapshot) => Selection,
	isEqual?: (a: Selection, b: Selection) => boolean,
): Selection {
	const committed = useRef<{ hasValue: boolean; value: Selection }>({
		hasValue: false,
		value: undefined as Selection,
	});
	const [getSelection, getServerSelection] = useMemo(() => {
		let hasMemo = false;
		let memoizedSnapshot: Snapshot;
		let memoizedSelection: Selection;

		const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
			if (!hasMemo) {
				hasMemo = true;
				memoizedSnapshot = nextSnapshot;
				const next = selector(nextSnapshot);
				if (isEqual && committed.current.hasValue && isEqual(committed.current.value, next)) {
					memoizedSelection = committed.current.value;
					return memoizedSelection;
				}
				memoizedSelection = next;
				return next;
			}
			if (Object.is(memoizedSnapshot, nextSnapshot)) return memoizedSelection;
			const next = selector(nextSnapshot);
			if (isEqual && isEqual(memoizedSelection, next)) {
				memoizedSnapshot = nextSnapshot;
				return memoizedSelection;
			}
			memoizedSnapshot = nextSnapshot;
			memoizedSelection = next;
			return next;
		};

		return [
			() => memoizedSelector(getSnapshot()),
			getServerSnapshot ? () => memoizedSelector(getServerSnapshot()) : undefined,
		] as const;
	}, [getSnapshot, getServerSnapshot, selector, isEqual]);

	const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);
	useEffect(() => {
		committed.current.hasValue = true;
		committed.current.value = value;
	}, [value]);
	return value;
}
