let queuedCallbacks: Set<() => void> | null = null;
let postTask: (() => void) | undefined;

function drainCallbacks(): void {
	const callbacks = queuedCallbacks;
	queuedCallbacks = null;
	if (callbacks === null) return;
	for (const callback of callbacks) {
		try {
			callback();
		} catch (error) {
			// Native observers report callback exceptions without preventing other
			// observers from receiving their entries. Preserve that isolation here.
			if (typeof reportError === 'function') reportError(error);
			else
				setTimeout(() => {
					throw error;
				}, 0);
		}
	}
}

function enqueue(callback: () => void): void {
	if (queuedCallbacks !== null) {
		queuedCallbacks.add(callback);
		return;
	}
	queuedCallbacks = new Set([callback]);
	if (postTask === undefined) {
		if (typeof MessageChannel === 'undefined') {
			postTask = () => {
				setTimeout(drainCallbacks, 0);
			};
		} else {
			const channel = new MessageChannel();
			channel.port1.onmessage = drainCallbacks;
			postTask = () => channel.port2.postMessage(null);
		}
	}
	postTask();
}

/**
 * A native ResizeObserver whose callbacks run in a task outside the browser's
 * resize delivery loop. State updates and DOM writes can then resize observed
 * targets without triggering an undelivered-notifications error in that loop.
 *
 * Entries are coalesced by target, retaining the latest native entry. Unobserving
 * a target discards its queued entry; disconnecting discards the entire batch.
 * The observer remains reusable after disconnect. Supply an owning window's
 * constructor when observing elements in another realm.
 *
 * Scheduling is independent of component commits and passive-effect drains.
 * Nothing is initialized at module evaluation, so SSR can import this helper.
 */
export function createResizeObserver(
	callback: ResizeObserverCallback,
	ResizeObserverCtor: typeof ResizeObserver = ResizeObserver,
): ResizeObserver {
	if (typeof callback !== 'function')
		throw new TypeError('ResizeObserver callback must be a function');
	const entries = new Map<Element, ResizeObserverEntry>();
	const boxes = new Map<Element, ResizeObserverBoxOptions>();
	let pending = false;
	const deliver = () => {
		if (!pending) return;
		pending = false;
		const batch = Array.from(entries.values());
		entries.clear();
		Reflect.apply(callback, observer, [batch, observer]);
	};
	const observer = new ResizeObserverCtor((batch) => {
		pending = true;
		for (const entry of batch) entries.set(entry.target, entry);
		enqueue(deliver);
	});
	const observe = observer.observe;
	const unobserve = observer.unobserve;
	const disconnect = observer.disconnect;
	const discard = (target: Element) => {
		if (entries.delete(target) && entries.size === 0) {
			pending = false;
			queuedCallbacks?.delete(deliver);
		}
	};
	observer.observe = function (target, options) {
		let box: ResizeObserverBoxOptions = 'content-box';
		let nativeOptions = options;
		if (options !== null && (typeof options === 'object' || typeof options === 'function')) {
			// Let native receiver/target validation precede dictionary conversion,
			// and retain the converted enum without reading a user getter twice.
			nativeOptions = {
				get box() {
					const value = options.box;
					if (value === undefined) return undefined;
					box = `${value}` as ResizeObserverBoxOptions;
					return box;
				},
			};
		}
		observe.call(this, target, nativeOptions);
		if (this !== observer) return;
		if (boxes.get(target) !== box) discard(target);
		boxes.set(target, box);
	};
	observer.unobserve = function (target) {
		unobserve.call(this, target);
		if (this !== observer) return;
		boxes.delete(target);
		discard(target);
		if (boxes.size === 0 && entries.size === 0) {
			pending = false;
			queuedCallbacks?.delete(deliver);
		}
	};
	observer.disconnect = function () {
		disconnect.call(this);
		if (this !== observer) return;
		boxes.clear();
		entries.clear();
		pending = false;
		queuedCallbacks?.delete(deliver);
	};
	return observer;
}
