import { startTransition, useState, useSyncExternalStore } from 'octane';

export function ExternalStoreProbe(props) @{
	const value = useSyncExternalStore(
		props.store.subscribe,
		props.store.getSnapshot,
		props.store.getServerSnapshot,
	);
	<span data-store-value={value as string}>{value as string}</span>
}

let setMutationState = (_value: string) => {};

export function MutationTransitionProbe() @{
	const [value, setValue] = useState('idle');
	setMutationState = setValue;
	<span data-mutation-state={value}>{value}</span>
}

export function transitionMutationState(value: string): void {
	startTransition(() => setMutationState(value));
}
