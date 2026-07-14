import { equal } from '@wry/equality';
import { createFulfilledPromise, decoratePromise } from '@apollo/client/utilities/internal';
export class FragmentReference {
	observable;
	key = {};
	promise;
	resolve;
	reject;
	subscription;
	listeners = new Set();
	autoDisposeTimeoutId;
	references = 0;
	constructor(client, watchFragmentOptions, options) {
		this.dispose = this.dispose.bind(this);
		this.handleNext = this.handleNext.bind(this);
		this.handleError = this.handleError.bind(this);
		this.observable = client.watchFragment(watchFragmentOptions);
		if (options.onDispose) {
			this.onDispose = options.onDispose;
		}
		const result = this.observable.getCurrentResult();
		// Start a timer that will automatically dispose of the query if the
		// suspended resource does not use this fragmentRef in the given time. This
		// helps prevent memory leaks when a component has unmounted before the
		// query has finished loading.
		const startDisposeTimer = () => {
			if (!this.references) {
				this.autoDisposeTimeoutId = setTimeout(
					this.dispose,
					options.autoDisposeTimeoutMs ?? 30_000,
				);
			}
		};
		this.promise = result.complete
			? createFulfilledPromise(result.data)
			: this.createPendingPromise();
		this.subscribeToFragment();
		this.promise.then(startDisposeTimer, startDisposeTimer);
	}
	listen(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	retain() {
		this.references++;
		clearTimeout(this.autoDisposeTimeoutId);
		let disposed = false;
		return () => {
			if (disposed) {
				return;
			}
			disposed = true;
			this.references--;
			setTimeout(() => {
				if (!this.references) {
					this.dispose();
				}
			});
		};
	}
	dispose() {
		this.subscription.unsubscribe();
	}
	onDispose() {
		// noop. overridable by options
	}
	subscribeToFragment() {
		this.subscription = this.observable.subscribe(
			this.handleNext.bind(this),
			this.handleError.bind(this),
		);
		// call `onDispose` when the subscription is finalized, either because it is
		// unsubscribed as a consequence of a `dispose` call or because the
		// ObservableQuery completes because of a `ApolloClient.stop()` call.
		this.subscription.add(this.onDispose);
	}
	handleNext(result) {
		switch (this.promise.status) {
			case 'pending': {
				if (result.complete) {
					return this.resolve?.(result.data);
				}
				this.deliver(this.promise);
				break;
			}
			case 'fulfilled': {
				// This can occur when we already have a result written to the cache and
				// we subscribe for the first time. We create a fulfilled promise in the
				// constructor with a value that is the same as the first emitted value
				// so we want to skip delivering it.
				if (equal(this.promise.value, result.data)) {
					return;
				}
				this.promise = result.complete
					? createFulfilledPromise(result.data)
					: this.createPendingPromise();
				this.deliver(this.promise);
			}
		}
	}
	handleError(error) {
		this.reject?.(error);
	}
	deliver(promise) {
		this.listeners.forEach((listener) => listener(promise));
	}
	createPendingPromise() {
		return decoratePromise(
			new Promise((resolve, reject) => {
				this.resolve = resolve;
				this.reject = reject;
			}),
		);
	}
}
