import { useSyncExternalStore, useState, useLayoutEffect } from 'octane';

// ---------------------------------------------------------------------------
// Fixtures for the store-sync commit-queue optimization (drainStoreSyncs +
// render-phase getSnapshot). They deliberately use UNSTABLE inline getSnapshot
// closures (a fresh closure every render — the zustand/query pattern) so the
// enqueue-elimination gate is under test, not bypassed by a memoized snapshot.
// ---------------------------------------------------------------------------

// A tiny keyed store: `state` is an arbitrary value; listeners fire on setState.
export function makeStore(initial) {
	let state = initial;
	const listeners = new Set();
	return {
		getState: () => state,
		// Notify listeners (the normal path).
		setState: (next) => {
			state = next;
			for (const l of [...listeners]) l();
		},
		// Mutate WITHOUT notifying — used to exercise the "silent mutation in the
		// render→commit window" divergence and the props-selector staleness path.
		setSilently: (next) => {
			state = next;
		},
		subscribe: (l) => {
			listeners.add(l);
			return () => {
				listeners.delete(l);
			};
		},
		listenerCount: () => listeners.size,
	};
}

// Consumer with an UNSTABLE inline getSnapshot. `onSnapshot`/`onRender` count
// calls so a test can assert the enqueue-elimination win (no commit-phase
// re-read on an unchanged update render). `tick` is an unrelated prop the parent
// bumps to force a props-driven re-render with an unchanged snapshot.
export function UnstableConsumer(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => {
		props.onSnapshot();
		return props.store.getState();
	});
	props.onRender();
	<span class="uc" data-tick={props.tick as string}>
		{value as string}
	</span>
}

// Parent that bumps an unrelated state (via #bump) and passes it down as `tick`
// so the child re-renders on a click even though the store never changed.
export function UnstableParent(props) @{
	const [tick, setTick] = useState(0);
	<div>
		<button id="bump" onClick={() => setTick((t) => t + 1)}>{'bump'}</button>
		<UnstableConsumer
			store={props.store}
			tick={tick}
			onSnapshot={props.onSnapshot}
			onRender={props.onRender}
		/>
	</div>
}

// Consumer whose inline getSnapshot closes over a PROP (`props.k`) — the
// props-dependent-selector staleness case. Selecting `state[k]`.
export function KeyedConsumer(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => props.store.getState()[props.k]);
	<span class="kc">
		{value as string}
	</span>
}

// Consumer that throws once the snapshot goes negative — anchors the
// throw-after-read partial-render risk (uSES read, THEN a throw to @catch).
function ThrowConsumer(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	if (value < 0) throw new Error('boom-' + -value as string);
	<span class="tc">
		{value as string}
	</span>
}

export function ThrowBoundary(props) @{
	@try {
		<ThrowConsumer store={props.store} />
	} @catch (e) {
		<span class="err">
			{'err:' + e.message as string}
		</span>
	}
}

// A sibling whose LAYOUT effect mutates + notifies the store during the SAME
// commit as the consumer's mount — exercises the forceUpdate-from-layout-drain +
// drainStoreSyncs tear-check path. The consumer must converge to the final value.
function LayoutMutator(props) @{
	useLayoutEffect(() => {
		props.store.setState(props.to);
	}, [props.to]);
	<span class="mut" />
}

export function SiblingApp(props) @{
	<div>
		<UnstableConsumer
			store={props.store}
			tick={0}
			onSnapshot={props.onSnapshot}
			onRender={props.onRender}
		/>
		<LayoutMutator store={props.store} to={props.to} />
	</div>
}
