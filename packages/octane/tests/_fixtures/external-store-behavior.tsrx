import { useSyncExternalStore, useLayoutEffect } from 'octane';

// A minimal external store with observable subscription cleanup.
export function makeStore(initial) {
	let state = initial;
	const listeners = new Set();
	return {
		getState: () => state,
		setState: (next) => {
			state = next;
			for (const l of [...listeners]) l();
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

// Use the inline selector shape common in Zustand and query-store adapters.
export function StoreConsumer(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => props.store.getState());
	<span class="uc">{value as string}</span>
}

// Select a field named by props so updates must use the latest selector.
export function KeyedConsumer(props) @{
	const value = useSyncExternalStore(props.store.subscribe, () => props.store.getState()[props.k]);
	<span class="kc">{value as string}</span>
}

// Throw after reading a negative snapshot so the nearest boundary handles it.
function ThrowConsumer(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	if (value < 0) throw new Error('boom-' + -value as string);
	<span class="tc">{value as string}</span>
}

export function ThrowBoundary(props) @{
	@try {
		<ThrowConsumer store={props.store} />
	} @catch (e) {
		<span class="err">{'err:' + e.message as string}</span>
	}
}

// A sibling mutates the store during layout; the consumer must converge to the
// value visible after the commit.
function LayoutMutator(props) @{
	useLayoutEffect(() => {
		props.store.setState(props.to);
	}, [props.to]);
	<span class="mut" />
}

export function SiblingApp(props) @{
	<div>
		<StoreConsumer store={props.store} />
		<LayoutMutator store={props.store} to={props.to} />
	</div>
}
