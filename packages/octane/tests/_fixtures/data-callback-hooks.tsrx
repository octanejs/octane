import { useCallback, useMemo, useState, useSyncExternalStore } from 'octane';

// A hook shaped like a store binding's selector read: the selection is memoized
// on the SELECTOR's identity, which is what dep-keying the callback is for.
export function useLocalSelector(source, selector, slot?: symbol) {
	const memo = useMemo(() => {
		let has = false;
		let lastSnap;
		let lastSel;
		return (snap) => {
			if (has && Object.is(lastSnap, snap)) return lastSel;
			has = true;
			lastSnap = snap;
			lastSel = selector(snap);
			return lastSel;
		};
	}, [selector]);
	const snapshot = useSyncExternalStore(source.subscribe, source.get, undefined, slot);
	return memo(snapshot);
}

// The selector reads `props.offset`, so its identity must move when the offset
// moves and hold when only unrelated state changes.
export function OffsetReader(props) @{
	const [tick, setTick] = useState(0);
	props.bind(setTick);
	const total = useLocalSelector(props.store, (s) => s.base + props.offset);
	<div>
		<span id="total">{total as string}</span>
		<span id="tick">{tick as string}</span>
	</div>
}

// The shape the compiler emits for a declared hook, written by hand: the
// selector wrapped in useCallback keyed on the member path it reads. Compiled
// output is asserted separately; this pins that the SHAPE is semantically
// correct, in both compile modes, independent of who produced it.
export function OffsetReaderKeyed(props) @{
	const [tick, setTick] = useState(0);
	props.bind(setTick);
	const selector = useCallback((s) => s.base + props.offset, [props.offset]);
	const total = useLocalSelector(props.store, selector);
	<div>
		<span id="total">{total as string}</span>
		<span id="tick">{tick as string}</span>
	</div>
}
