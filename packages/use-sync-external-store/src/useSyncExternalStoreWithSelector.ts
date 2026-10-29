/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.upstream file in the root directory of this package.
 */

// Adapted from use-sync-external-store@1.7.0 src/useSyncExternalStoreWithSelector.js
// onto Octane's hooks. Both `with-selector` entry points share this module:
// upstream builds one against React's built-in useSyncExternalStore and one
// against its shim, and on React 18+ the shim is the built-in, as it always is
// on Octane.
import {
	createSubSlot,
	useDebugValue,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from 'octane';

// This file is not compiled, so the caller's hook slot arrives as the trailing
// argument and each composed hook derives its own sub-slot from it.
const subSlot = createSubSlot({ slotlessPrefix: '@octanejs/use-sync-external-store:' });

// Same as useSyncExternalStore, but supports selector and isEqual arguments.
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: undefined | null | (() => Snapshot),
	selector: (snapshot: Snapshot) => Selection,
	isEqual?: (a: Selection, b: Selection) => boolean,
): Selection;
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: undefined | null | (() => Snapshot),
	selector: (snapshot: Snapshot) => Selection,
	isEqualOrSlot?: ((a: Selection, b: Selection) => boolean) | symbol,
	trailingSlot?: symbol,
): Selection {
	// A call that omits isEqual carries the slot in its place.
	const isEqual = typeof isEqualOrSlot === 'symbol' ? undefined : isEqualOrSlot;
	const slot = typeof isEqualOrSlot === 'symbol' ? isEqualOrSlot : trailingSlot;

	type Inst = { hasValue: boolean; value: Selection | null };

	// Use this to track the rendered snapshot.
	const instRef = useRef<Inst | null>(null, subSlot(slot, 'inst'));
	let inst: Inst;
	if (instRef.current === null) {
		inst = {
			hasValue: false,
			value: null,
		};
		instRef.current = inst;
	} else {
		inst = instRef.current;
	}

	const [getSelection, getServerSelection] = useMemo(
		() => {
			// Track the memoized state using closure variables that are local to this
			// memoized instance of a getSnapshot function. Intentionally not using a
			// useRef hook, because that state would be shared across all concurrent
			// copies of the hook/component.
			let hasMemo = false;
			let memoizedSnapshot: Snapshot;
			let memoizedSelection: Selection;
			const memoizedSelector = (nextSnapshot: Snapshot) => {
				if (!hasMemo) {
					// The first time the hook is called, there is no memoized result.
					hasMemo = true;
					memoizedSnapshot = nextSnapshot;
					const nextSelection = selector(nextSnapshot);
					if (isEqual !== undefined) {
						// Even if the selector has changed, the currently rendered selection
						// may be equal to the new selection. We should attempt to reuse the
						// current value if possible, to preserve downstream memoizations.
						if (inst.hasValue) {
							const currentSelection = inst.value as Selection;
							if (isEqual(currentSelection, nextSelection)) {
								memoizedSelection = currentSelection;
								return currentSelection;
							}
						}
					}
					memoizedSelection = nextSelection;
					return nextSelection;
				}

				// We may be able to reuse the previous invocation's result.
				const prevSnapshot: Snapshot = memoizedSnapshot;
				const prevSelection: Selection = memoizedSelection;

				if (Object.is(prevSnapshot, nextSnapshot)) {
					// The snapshot is the same as last time. Reuse the previous selection.
					return prevSelection;
				}

				// The snapshot has changed, so we need to compute a new selection.
				const nextSelection = selector(nextSnapshot);

				// If a custom isEqual function is provided, use that to check if the data
				// has changed. If it hasn't, return the previous selection. That signals
				// to Octane that the selections are conceptually equal, and we can bail
				// out of rendering.
				if (isEqual !== undefined && isEqual(prevSelection, nextSelection)) {
					// The snapshot still has changed, so make sure to update to not keep
					// old references alive
					memoizedSnapshot = nextSnapshot;
					return prevSelection;
				}

				memoizedSnapshot = nextSnapshot;
				memoizedSelection = nextSelection;
				return nextSelection;
			};
			// Assigning this to a constant so that TypeScript knows it can't change.
			const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot;
			const getSnapshotWithSelector = () => memoizedSelector(getSnapshot());
			const getServerSnapshotWithSelector =
				maybeGetServerSnapshot === null
					? undefined
					: () => memoizedSelector(maybeGetServerSnapshot());
			return [getSnapshotWithSelector, getServerSnapshotWithSelector] as const;
		},
		[getSnapshot, getServerSnapshot, selector, isEqual],
		subSlot(slot, 'memo'),
	);

	const value = useSyncExternalStore(
		subscribe,
		getSelection,
		getServerSelection,
		subSlot(slot, 'store'),
	);

	useEffect(
		() => {
			inst.hasValue = true;
			inst.value = value;
		},
		[value],
		subSlot(slot, 'effect'),
	);

	useDebugValue(value);
	return value;
}
