// Verbatim port of react-redux's utils/Subscription.ts (framework-agnostic).
// The Subscription coordinates the Provider's single store subscription with
// nested per-component subscriptions, notifying top-down (ancestors before
// descendants) — the ordering `connect` relies on and hooks benefit from.
import type { Store } from 'redux';

type VoidFunc = () => void;

interface Listener {
	callback: VoidFunc;
	next: Listener | null;
	prev: Listener | null;
}

function createListenerCollection() {
	let first: Listener | null = null;
	let last: Listener | null = null;
	return {
		clear() {
			first = null;
			last = null;
		},
		notify() {
			let listener = first;
			while (listener) {
				listener.callback();
				listener = listener.next;
			}
		},
		get() {
			const listeners: Listener[] = [];
			let listener = first;
			while (listener) {
				listeners.push(listener);
				listener = listener.next;
			}
			return listeners;
		},
		subscribe(callback: VoidFunc) {
			let isSubscribed = true;
			const listener: Listener = (last = {
				callback,
				next: null,
				prev: last,
			});
			if (listener.prev) {
				listener.prev.next = listener;
			} else {
				first = listener;
			}
			return function unsubscribe() {
				if (!isSubscribed || first === null) return;
				isSubscribed = false;
				if (listener.next) {
					listener.next.prev = listener.prev;
				} else {
					last = listener.prev;
				}
				if (listener.prev) {
					listener.prev.next = listener.next;
				} else {
					first = listener.next;
				}
			};
		},
	};
}

type ListenerCollection = ReturnType<typeof createListenerCollection>;

export interface Subscription {
	addNestedSub: (listener: VoidFunc) => VoidFunc;
	notifyNestedSubs: VoidFunc;
	handleChangeWrapper: VoidFunc;
	isSubscribed: () => boolean;
	onStateChange?: VoidFunc | null;
	trySubscribe: VoidFunc;
	tryUnsubscribe: VoidFunc;
	getListeners: () => Pick<ListenerCollection, 'notify' | 'get'>;
}

const nullListeners = {
	notify() {},
	get: () => [] as Listener[],
};

export function createSubscription(store: Store, parentSub?: Subscription): Subscription {
	let unsubscribe: VoidFunc | undefined;
	let listeners: Pick<ListenerCollection, 'notify' | 'get'> & Partial<ListenerCollection> =
		nullListeners;
	let subscriptionsAmount = 0;
	let selfSubscribed = false;

	function addNestedSub(listener: VoidFunc) {
		trySubscribe();
		const cleanupListener = (listeners as ListenerCollection).subscribe(listener);
		let removed = false;
		return () => {
			if (!removed) {
				removed = true;
				cleanupListener();
				tryUnsubscribe();
			}
		};
	}

	function notifyNestedSubs() {
		listeners.notify();
	}

	function handleChangeWrapper() {
		if (subscription.onStateChange) {
			subscription.onStateChange();
		}
	}

	function isSubscribed() {
		return selfSubscribed;
	}

	function trySubscribe() {
		subscriptionsAmount++;
		if (!unsubscribe) {
			unsubscribe = parentSub
				? parentSub.addNestedSub(handleChangeWrapper)
				: store.subscribe(handleChangeWrapper);
			listeners = createListenerCollection();
		}
	}

	function tryUnsubscribe() {
		subscriptionsAmount--;
		if (unsubscribe && subscriptionsAmount === 0) {
			unsubscribe();
			unsubscribe = undefined;
			(listeners as ListenerCollection).clear();
			listeners = nullListeners;
		}
	}

	function trySubscribeSelf() {
		if (!selfSubscribed) {
			selfSubscribed = true;
			trySubscribe();
		}
	}

	function tryUnsubscribeSelf() {
		if (selfSubscribed) {
			selfSubscribed = false;
			tryUnsubscribe();
		}
	}

	const subscription: Subscription = {
		addNestedSub,
		notifyNestedSubs,
		handleChangeWrapper,
		isSubscribed,
		trySubscribe: trySubscribeSelf,
		tryUnsubscribe: tryUnsubscribeSelf,
		getListeners: () => listeners,
	};

	return subscription;
}
