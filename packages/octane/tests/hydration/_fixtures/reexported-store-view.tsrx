import { useSyncExternalStore } from './reexported-store.ts';

export function ReexportedStoreView(props) @{
	const v = useSyncExternalStore(
		props.store.subscribe,
		props.store.getSnapshot,
		props.store.getServerSnapshot,
	);
	<span id="sv">{v as string}</span>
}
