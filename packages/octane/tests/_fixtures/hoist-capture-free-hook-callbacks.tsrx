import { useCallback, useState, useSyncExternalStore } from 'octane';

// Capture-free callbacks passed to hooks that treat them as DATA are lifted to
// module scope in production compiles. These fixtures pin the semantics that
// must survive that lift, and the neighbouring behavior it must not disturb.

// Both subscriptions pass capture-free callbacks, so both are lifted. They must
// still track their own store, and the two call sites must keep independent
// hook state despite now sharing module-scope functions.
export function TwoStoreReaders(props) @{
	const a = useSyncExternalStore(props.storeA.subscribe, props.storeA.get);
	const b = useSyncExternalStore(props.storeB.subscribe, props.storeB.get);
	<p id="readers">{a + '/' + b}</p>
}

// A custom hook receiving a capture-free selector (lifted) beside one that
// captures component state (kept). The capturing selector must keep seeing the
// current multiplier.
export function useSelection(source, selector, slot?: symbol) {
	const value = useSyncExternalStore(source.subscribe, source.get, undefined, slot);
	return selector(value);
}

export function MixedSelectors(props) @{
	const [multiplier, setMultiplier] = useState(1);
	const plain = useSelection(props.store, (v) => v + 1);
	const scaled = useSelection(props.store, (v) => v * multiplier);
	<div>
		<button id="scale" onClick={() => setMultiplier(multiplier + 1)}>{'scale'}</button>
		<p id="selectors">{plain + '/' + scaled}</p>
	</div>
}

// `useCallback` is excluded from lifting because it RETURNS its argument and
// promises a fresh identity when deps change. Pinned behaviorally so the
// exclusion cannot be dropped without a failure.
export function CallbackIdentityAcrossDeps(props) @{
	const cb = useCallback(() => 'constant', [props.depKey]);
	props.observe(cb);
	<p id="cb">{props.depKey as string}</p>
}
