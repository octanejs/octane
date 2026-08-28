// Replaces @xstate/react@6.1.0's `use-sync-external-store/shim/with-selector`
// dependency: React's shim, reimplemented on Octane's native
// useSyncExternalStore with the exact same memoization algorithm. The selection
// is recomputed only when the SNAPSHOT changes; when `isEqual` says the new
// selection matches the previous one, the previous REFERENCE is kept so the
// store's uSES bails the re-render out.
//
// Byte-compatible with the copies in @octanejs/redux and
// @octanejs/tanstack-store; kept local so this package's published source has no
// cross-binding runtime dependency.
import { useSyncExternalStore, useRef, useMemo, useEffect } from 'octane';
import { splitSlot, subSlot } from './internal.ts';

const objectIs: (x: unknown, y: unknown) => boolean =
	typeof Object.is === 'function'
		? Object.is
		: (x: any, y: any) => (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y);

export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
	subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => Snapshot,
	getServerSnapshot: undefined | null | (() => Snapshot),
	selector: (snapshot: Snapshot) => Selection,
	...rest: [isEqual?: (a: Selection, b: Selection) => boolean, slot?: symbol]
): Selection {
	// A compiled direct call that omits the optional equality function arrives as
	// `[slot]`, while binding-internal calls arrive as `[isEqual, slot]`. Split the
	// compiler-owned tail before interpreting the user argument so a Symbol can
	// never be mistaken for an equality function.
	const [userArgs, slot] = splitSlot(rest);
	const isEqual = userArgs[0] as ((a: Selection, b: Selection) => boolean) | undefined;
	const instRef = useRef<{ hasValue: boolean; value: Selection | null } | null>(
		null,
		subSlot(slot, 'ws:inst'),
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
				if (objectIs(memoizedSnapshot, nextSnapshot)) return currentSelection;
				const nextSelection = selector(nextSnapshot);
				if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
					memoizedSnapshot = nextSnapshot;
					return currentSelection;
				}
				memoizedSnapshot = nextSnapshot;
				return (memoizedSelection = nextSelection);
			};
			const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot;
			return [
				() => memoizedSelector(getSnapshot()),
				maybeGetServerSnapshot === null
					? undefined
					: () => memoizedSelector(maybeGetServerSnapshot!()),
			] as const;
		},
		[getSnapshot, getServerSnapshot, selector, isEqual],
		subSlot(slot, 'ws:memo'),
	);

	// Octane gates its commit-time store sync on the VALUE rather than re-reading
	// `getSnapshot` at commit the way React does, so a store that mutates without
	// notifying between render and commit is not reconciled until its next notify.
	// Unreachable through this binding, whose actors always notify.
	// OCTANE DIVERGENCE[xstate-sync-external-store-commit-reread][ordinary:xstate-sync-external-store-skips-commit-reread]
	//
	// The server snapshot is defaulted rather than forwarded as `undefined`.
	// Upstream's `use-sync-external-store` shim passes `getServerSelection`
	// through, which is what makes React throw when a caller supplies no server
	// snapshot; Octane's hook already falls back to `getSnapshot`, and this
	// default keeps the memoized selection on that same path.
	// OCTANE DIVERGENCE[xstate-optional-server-snapshot][ordinary:xstate-server-snapshot-fallback]
	const value = useSyncExternalStore(
		subscribe,
		getSelection,
		getServerSelection ?? getSelection,
		subSlot(slot, 'ws:uses'),
	);

	useEffect(
		() => {
			inst.hasValue = true;
			inst.value = value;
		},
		[value],
		subSlot(slot, 'ws:eff'),
	);

	return value;
}
