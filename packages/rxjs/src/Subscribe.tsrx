import { Suspense, useEffect, useRef } from 'octane';
import { liftSuspense } from '@rx-state/core';
import { Subscription } from 'rxjs';
import type { OctaneNode } from 'octane';
import type { StateObservable } from '@rx-state/core';
import type { Observable } from 'rxjs';
import { SubscriptionContext } from './context.ts';

type Props = {
	children?: OctaneNode;
	source$?: Observable<unknown>;
	fallback?: OctaneNode;
};

const EMPTY = Symbol('empty');

export function Subscribe(props: Props) @{
	const owner = useRef<
		| {
				children: Subscription;
				source: Observable<unknown> | undefined;
				sourceSubscription: Subscription | null;
				add: (source: StateObservable<unknown>) => void;
		  }
		| null
	>(null);

	if (!owner.current) {
		const children = new Subscription();
		owner.current = {
			children,
			source: undefined,
			sourceSubscription: null,
			add(source) {
				let synchronousError: unknown = EMPTY;
				let synchronous = true;
				children.add(
					liftSuspense()(source).subscribe({
						error(error) {
							if (synchronous) synchronousError = error;
						},
					}),
				);
				synchronous = false;
				if (synchronousError !== EMPTY) throw synchronousError;
			},
		};
	}

	if (owner.current.source !== props.source$) {
		owner.current.sourceSubscription?.unsubscribe();
		owner.current.source = props.source$;
		owner.current.sourceSubscription = props.source$
			? liftSuspense()(props.source$).subscribe({
					// The owned source subscription exists only to keep the source
					// active. Consumers surface observable errors through their own
					// subscriptions, so do not also report them as unhandled here.
					error() {},
				})
			: null;
	}

	useEffect(
		() => () => {
			owner.current?.sourceSubscription?.unsubscribe();
			owner.current?.children.unsubscribe();
			owner.current = null;
		},
		[],
	);

	@if (props.fallback === undefined) {
		<SubscriptionContext.Provider
			value={owner.current.add}
		>{props.children}</SubscriptionContext.Provider>
	} @else {
		<Suspense fallback={props.fallback}>
			<SubscriptionContext.Provider
				value={owner.current.add}
			>{props.children}</SubscriptionContext.Provider>
		</Suspense>
	}
}

export function RemoveSubscribe(props: { children?: OctaneNode }) @{
	<SubscriptionContext.Provider value={null}>{props.children}</SubscriptionContext.Provider>
}
