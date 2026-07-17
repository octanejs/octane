// Port of `use-sync-external-store/with-selector` onto Octane's native
// useSyncExternalStore. Snapshot memoization preserves the previous selected
// reference when the equality function accepts a new selection.
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'octane';

import { splitSlot, subSlot } from './internal';

const objectIs: (left: unknown, right: unknown) => boolean =
	typeof Object.is === 'function'
		? Object.is
		: (left: any, right: any) =>
				(left === right && (left !== 0 || 1 / left === 1 / right)) ||
				(left !== left && right !== right);

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: undefined | null | (() => Snapshot),
	selector: (snapshot: Snapshot) => Selection,
	...args: [isEqual?: (left: Selection, right: Selection) => boolean, slot?: symbol]
): Selection {
	const [userArgs, slot] = splitSlot(args);
	const isEqual = userArgs[0] as ((left: Selection, right: Selection) => boolean) | undefined;
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
							memoizedSelection = currentSelection;
							return currentSelection;
						}
					}

					memoizedSelection = nextSelection;
					return nextSelection;
				}

				const currentSelection = memoizedSelection;
				if (objectIs(memoizedSnapshot, nextSnapshot)) {
					return currentSelection;
				}

				const nextSelection = selector(nextSnapshot);
				if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
					memoizedSnapshot = nextSnapshot;
					return currentSelection;
				}

				memoizedSnapshot = nextSnapshot;
				memoizedSelection = nextSelection;
				return nextSelection;
			};

			const serverSnapshot = getServerSnapshot ?? undefined;
			return [
				() => memoizedSelector(getSnapshot()),
				serverSnapshot === undefined ? undefined : () => memoizedSelector(serverSnapshot()),
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
