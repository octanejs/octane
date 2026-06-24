import { useSyncExternalStore, useCallback, useState, useMemo } from 'octane-ts';

// ---------------------------------------------------------------------------
// External store factory. A mutable cell + a Set of listeners. `set` mutates
// the value and notifies every listener synchronously (each notify triggers a
// re-render via the store's setTick). Identical-by-reference subscribe /
// getState keep useEffect deps stable across renders.
// ---------------------------------------------------------------------------
export function createExternalStore(initial) {
	let currentState = initial;
	const listeners = new Set();
	return {
		set(next) {
			currentState = next;
			for (const l of listeners) l();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getState() {
			return currentState;
		},
		getSubscriberCount() {
			return listeners.size;
		},
	};
}

// A single consumer of a shared store. Renders the snapshot it reads. Multiple
// of these mounted against the SAME store must always agree after a flush
// (no tearing): they read the same getState through the same notify cycle.
export function Consumer(props) @{
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getState = useCallback(props.store.getState, [props.store]);
	const value = useSyncExternalStore(subscribe, getState);
	<span class={props.cls}>
		{value as string}
	</span>
}

// App that mounts three consumers of one shared store. Used to assert
// consistency (all three show the same value) after a synchronous mutate.
export function TripleConsumer(props) @{
	<div id="triple">
		<Consumer store={props.store} cls="a" />
		<Consumer store={props.store} cls="b" />
		<Consumer store={props.store} cls="c" />
	</div>
}

// ---------------------------------------------------------------------------
// Render-phase mirror. React's "next value is correctly cached when state is
// dispatched in render phase" (useSyncExternalStore-test.js:244): mirror the
// store snapshot into local state during render; when the snapshot differs
// from the mirror, dispatch a setter in the render body. The store value goes
// initial -> changed -> initial; setting back to a previously-seen value MUST
// re-render (the cached snapshot has to update each commit), so the mirror
// tracks the store exactly.
// ---------------------------------------------------------------------------
export function CachedMirror(props) @{
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getState = useCallback(props.store.getState, [props.store]);
	const value = useSyncExternalStore(subscribe, getState);
	const [mirror, setMirror] = useState(value);
	if (value !== mirror) setMirror(value);
	<span id="mirror">
		{(value + '|' + mirror) as string}
	</span>
}

// ---------------------------------------------------------------------------
// Reference-churn store. `set` swaps the store object reference but keeps the
// underlying value identical. getSnapshot returns the current reference. A
// store that returns a fresh reference for an unchanged value breaks React's
// rules, but must NOT cause an infinite render loop. Octane dedups store
// notifications with Object.is(inst.value, getSnapshot()); a per-read fresh
// reference defeats that dedup. React's "regression: does not infinite loop
// for only changing store reference in render" (:355) covers this.
// ---------------------------------------------------------------------------
export function makeRefChurnStore() {
	let ref = { value: { text: '(not set)' } };
	const listeners = new Set();
	const emit = () => {
		for (const l of [...listeners]) l();
	};
	const api = {
		set(text) {
			// New OUTER reference, SAME inner value object identity preserved
			// only when text matches — here we always rebuild, changing ref.
			ref = { value: { text } };
			emit();
		},
		// Touch: swap the outer ref but keep inner value identical (the
		// rule-breaking case — new snapshot reference, unchanged data).
		touch() {
			ref = { ...ref };
			emit();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot() {
			return ref;
		},
		getSubscriberCount() {
			return listeners.size;
		},
	};
	return api;
}

// Consumer that mutates the store exactly once on mount (via useMemo with an
// empty dep list), mirroring React's StoreText. The on-mount set breaks the
// rules of React but must be handled gracefully (converge, no infinite loop).
export function ChurnConsumer(props) @{
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getSnapshot = useCallback(props.store.getSnapshot, [props.store]);
	const snap = useSyncExternalStore(subscribe, getSnapshot);
	useMemo(() => {
		// Set the store value once on mount (empty deps).
		if (snap.value.text === '(not set)') props.store.set('B');
	}, []);
	<span id="churn">
		{(snap.value.text) as string}
	</span>
}
