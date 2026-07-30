import { liftSuspense, NoSubscribersError, StatePromise } from '@rx-state/core';
import { useReducer, useRef, useSyncExternalStore } from 'octane';
import type { DefaultedStateObservable, StateObservable, SUSPENSE } from '@rx-state/core';
import { useSubscription } from './context.ts';
import { subSlot } from './internal.ts';

type Value<T> = Exclude<T, typeof SUSPENSE>;
type VoidCallback = () => void;

interface ObservableRef<T> {
	source: StateObservable<T>;
	subscribe: (callback: VoidCallback) => VoidCallback;
	getSnapshot: () => Value<T>;
}

export function useStateObservable<T>(
	source: StateObservable<T>,
	slot?: symbol,
	identity?: readonly unknown[],
): Value<T> {
	const subscription = useSubscription();
	const identityRef = useRef<readonly unknown[] | StateObservable<T>>(
		identity ?? source,
		subSlot(slot, 'identity'),
	);
	const previousIdentity = identityRef.current;
	if (
		identity &&
		(!Array.isArray(previousIdentity) ||
			previousIdentity.length !== identity.length ||
			identity.some((value, index) => (previousIdentity as readonly unknown[])[index] !== value))
	) {
		identityRef.current = identity;
	}
	const sourceIdentity = identityRef.current;
	const errorRef = useRef<
		{ source: readonly unknown[] | StateObservable<T>; error: unknown } | undefined
	>(undefined, subSlot(slot, 'error'));
	const [, rerender] = useReducer((count: number) => count + 1, 0, subSlot(slot, 'error-update'));
	const callbackRef = useRef<ObservableRef<T> | undefined>(undefined, subSlot(slot, 'callbacks'));

	if (!callbackRef.current) {
		const getSnapshot = () => {
			const current = callbackRef.current!.source as DefaultedStateObservable<T>;
			if (!current.getRefCount() && !current.getDefaultValue) {
				if (!subscription) throw new Error('Missing Subscribe!');
				subscription(current);
			}
			const value = current.getValue();
			if (value instanceof StatePromise) {
				throw value.catch((error) => {
					if (error instanceof NoSubscribersError) return error;
					throw error;
				});
			}
			return value as Value<T>;
		};
		callbackRef.current = {
			source: null as unknown as StateObservable<T>,
			subscribe: () => () => {},
			getSnapshot,
		};
	}

	const ref = callbackRef.current;
	if (ref.source !== source) {
		ref.source = source;
		ref.subscribe = (notify) => {
			const active = liftSuspense()(source).subscribe({
				next: notify,
				error: (error) => {
					errorRef.current = { source: sourceIdentity, error };
					rerender(0);
				},
			});
			return () => active.unsubscribe();
		};
	}

	const value = useSyncExternalStore(
		ref.subscribe,
		ref.getSnapshot,
		ref.getSnapshot,
		subSlot(slot, 'store'),
	);
	if (errorRef.current?.source === sourceIdentity) throw errorRef.current.error;
	return value;
}
