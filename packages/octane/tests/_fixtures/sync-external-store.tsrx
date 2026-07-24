import { useSyncExternalStore, useCallback } from 'octane';

type StoreListener = () => void;
type StoreLike = {
	get: () => unknown;
	subscribe: (notify: StoreListener) => () => void;
};

// Smallest practical store: a mutable counter with a Set of listeners.
// Identical-by-reference subscribe / getSnapshot keep the useEffect deps
// stable across renders — re-mounting / re-subscribing only when a fresh
// store identity flows in.
export function makeStore(initial = 0) {
	let value = initial;
	const listeners = new Set();
	return {
		get: () => value,
		set: (next) => {
			value = next;
			for (const l of listeners) l();
		},
		subscribe: (notify) => {
			listeners.add(notify);
			return () => {
				listeners.delete(notify);
			};
		},
		listenerCount: () => listeners.size,
	};
}

// Reads the snapshot via useSyncExternalStore and renders it. Memoized
// `subscribe` / `getSnapshot` so re-renders don't churn the effect deps.
export function Reader(props) @{
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getSnapshot = useCallback(props.store.get, [props.store]);
	const value = useSyncExternalStore(subscribe, getSnapshot);
	<p class="value">{value as string}</p>
}

// Marks only the component's render interval so tests can distinguish render
// from the later subscription lifecycle without observing runtime internals.
export function RenderObservedReader(props: {
	store: StoreLike;
	onRenderState: (rendering: boolean) => void;
}) @{
	props.onRenderState(true);
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getSnapshot = useCallback(props.store.get, [props.store]);
	const value = useSyncExternalStore(subscribe, getSnapshot);
	props.onRenderState(false);
	<p class="value">{value as string}</p>
}

// Same component bound to a different store identity — exercises the
// re-subscribe-on-store-swap path.
export function SwappableReader(props) @{
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getSnapshot = useCallback(props.store.get, [props.store]);
	const value = useSyncExternalStore(subscribe, getSnapshot);
	<p class="value" data-key={props.store === props.alt ? 'alt' : 'main'}>{value as string}</p>
}

// Removes the reader without unmounting its host so a stale store callback
// cannot hide a resurrection behind wholesale root teardown.
export function ConditionalReader(props: { store: StoreLike; show: boolean }) @{
	<div id="conditional-host">
		<span id="conditional-survivor">{'keep'}</span>
		@if (props.show) {
			<Reader store={props.store} />
		}
	</div>
}

// Deliberately retains the most recently subscribed callback after unsubscribe.
// Real stores can retain stale listener snapshots while notifying; invoking it
// lets the test prove an already-removed owner stays dead.
export function makeRetainedCallbackStore(initial = 0): StoreLike & {
	notifyRetained: (next: number) => boolean;
	listenerCount: () => number;
} {
	let value = initial;
	let retained: StoreListener | null = null;
	const listeners = new Set<StoreListener>();
	return {
		get: () => value,
		subscribe: (notify: StoreListener) => {
			retained = notify;
			listeners.add(notify);
			return () => {
				listeners.delete(notify);
			};
		},
		notifyRetained: (next: number) => {
			value = next;
			if (retained === null) return false;
			retained();
			return true;
		},
		listenerCount: () => listeners.size,
	};
}
