import { useEffect, useMemo, useRef, useSyncExternalStore } from 'octane';
import { subSlot } from './internal';

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: undefined | null | (() => Snapshot),
	selector: (snapshot: Snapshot) => Selection,
	isEqual?: (a: Selection, b: Selection) => boolean,
	slot?: symbol,
): Selection {
	const instRef = useRef<{ hasValue: boolean; value: Selection | null } | null>(
		null,
		subSlot(slot, 'selector:instance'),
	);
	let inst: { hasValue: boolean; value: Selection | null };
	if (instRef.current === null) {
		inst = { hasValue: false, value: null };
		instRef.current = inst;
	} else {
		inst = instRef.current;
	}

	const [getSelection, getServerSelection] = useMemo(
		() => {
			let hasMemo = false;
			let memoizedSnapshot: Snapshot;
			let memoizedSelection: Selection;
			const memoizedSelector = (nextSnapshot: Snapshot): Selection => {
				if (!hasMemo) {
					hasMemo = true;
					memoizedSnapshot = nextSnapshot;
					const nextSelection = selector(nextSnapshot);
					if (isEqual !== undefined && inst.hasValue) {
						const currentSelection = inst.value as Selection;
						if (isEqual(currentSelection, nextSelection)) {
							return (memoizedSelection = currentSelection);
						}
					}
					return (memoizedSelection = nextSelection);
				}
				const currentSelection = memoizedSelection;
				if (Object.is(memoizedSnapshot, nextSnapshot)) return currentSelection;
				const nextSelection = selector(nextSnapshot);
				if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
					memoizedSnapshot = nextSnapshot;
					return currentSelection;
				}
				memoizedSnapshot = nextSnapshot;
				return (memoizedSelection = nextSelection);
			};
			return [
				() => memoizedSelector(getSnapshot()),
				getServerSnapshot == null ? undefined : () => memoizedSelector(getServerSnapshot()),
			] as const;
		},
		[getSnapshot, getServerSnapshot, selector, isEqual],
		subSlot(slot, 'selector:memo'),
	);

	const value = useSyncExternalStore(
		subscribe,
		getSelection,
		getServerSelection ?? getSelection,
		subSlot(slot, 'selector:store'),
	);

	useEffect(
		() => {
			inst.hasValue = true;
			inst.value = value;
		},
		[value],
		subSlot(slot, 'selector:effect'),
	);

	return value;
}
