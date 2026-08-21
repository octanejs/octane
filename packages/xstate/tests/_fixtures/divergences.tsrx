// Fixtures for the intentional divergence from @xstate/react@6.1.0 that lives
// in Octane's `useSyncExternalStore` commit-sync gate (see ../../UPSTREAM.md,
// "Intentional divergences"). No adapted upstream case can reach it: a real
// xstate actor notifies on every transition, so the window only opens for a
// hand-rolled actor-like object that mutates its snapshot silently.
import { useLayoutEffect, useState, useSyncExternalStore } from 'octane';

export interface ActorLikeRef {
	getSnapshot(): number;
	subscribe(observer: { next: () => void }): { unsubscribe(): void };
}

export interface ActorLikeStore {
	/** Shaped like an xstate ActorRef: observer `subscribe` plus `getSnapshot`. */
	readonly actorRef: ActorLikeRef;
	// Identity-stable across renders, exactly like the `useCallback(…, [actor])`
	// both ported hooks build, so `useSyncExternalStore` never sees a store swap.
	readonly subscribe: (onStoreChange: () => void) => () => void;
	/** Mutate and notify — what every xstate actor does on a transition. */
	send(next: number): void;
	/** Mutate WITHOUT notifying — the only window the divergence is visible in. */
	mutateSilently(next: number): void;
}

export function createActorLikeStore(initial: number): ActorLikeStore {
	let snapshot = initial;
	const observers = new Set<() => void>();
	const actorRef: ActorLikeRef = {
		getSnapshot: () => snapshot,
		subscribe(observer: { next: () => void }) {
			observers.add(observer.next);
			return {
				unsubscribe() {
					observers.delete(observer.next);
				},
			};
		},
	};

	return {
		actorRef,
		subscribe: (onStoreChange: () => void) => actorRef.subscribe({
			next: onStoreChange,
		}).unsubscribe,
		send(next: number) {
			snapshot = next;
			for (const observer of [...observers]) observer();
		},
		mutateSilently(next: number) {
			snapshot = next;
		},
	};
}

// Reads the store through a FRESH `getSnapshot` closure every render. That
// identity change is what React's `updateSyncExternalStore` keys its commit-time
// re-read on; `subscribe` stays stable so the store-swap branch never fires.
export function StoreReadout(props: { store: ActorLikeStore; label: number }) @{
	const value = useSyncExternalStore(
		props.store.subscribe,
		() => props.store.actorRef.getSnapshot(),
	);

	<span id="readout">{'value=' + value + ' label=' + props.label}</span>
}

// Mutates the store from a layout effect: that runs during commit and BEFORE the
// store-sync drain, so it lands inside the render-to-commit window. `notify`
// picks between the two mutation shapes.
export function CommitWindowMutator(props: {
	store: ActorLikeStore;
	label: number;
	notify: boolean;
}) @{
	useLayoutEffect(() => {
		if (props.label === 0) return;
		if (props.notify) {
			props.store.send(props.label);
		} else {
			props.store.mutateSilently(props.label);
		}
	}, [props.label, props.notify]);

	<span id="mutator">{'label=' + props.label}</span>
}

export function CommitWindowApp(props: { store: ActorLikeStore; notify: boolean }) @{
	const [label, setLabel] = useState(0);

	<div>
		<StoreReadout store={props.store} label={label} />
		<CommitWindowMutator store={props.store} label={label} notify={props.notify} />
		<button id="bump" onClick={() => setLabel(label + 1)}>
			bump
		</button>
	</div>
}
