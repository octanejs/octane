import { useEffect } from 'octane';
import { useSyncExternalStore } from '@octanejs/use-sync-external-store/shim';
import { useSyncExternalStoreWithSelector } from '@octanejs/use-sync-external-store/with-selector';

export interface Store<T> {
	subscribe(listener: () => void): () => void;
	getSnapshot(): T;
	getServerSnapshot?: () => T;
}

export function StoreText(props: { store: Store<string>; log: string[] }) @{
	const text = useSyncExternalStore(
		props.store.subscribe,
		props.store.getSnapshot,
		props.store.getServerSnapshot,
	);
	useEffect(() => {
		props.log.push('Passive effect: ' + text);
	}, [text]);
	<div id="text">{text as string}</div>
}

export interface Counts {
	a: number;
	b: number;
}

// Two selector hooks in one component, one without isEqual and one with it.
export function SelectedCounts(props: { store: Store<Counts>; selections: { b: number }[] }) @{
	const a = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getSnapshot,
		props.store.getServerSnapshot,
		(state) => state.a,
	);
	const b = useSyncExternalStoreWithSelector(
		props.store.subscribe,
		props.store.getSnapshot,
		null,
		(state) => ({ b: state.b }),
		(left, right) => left.b === right.b,
	);
	props.selections.push(b);
	<p id="counts">{a + ':' + b.b}</p>
}
