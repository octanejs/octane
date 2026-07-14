import { equal } from '@wry/equality';
import { filter } from 'rxjs';
import {
	createFulfilledPromise,
	createRejectedPromise,
	decoratePromise,
} from '@apollo/client/utilities/internal';
import { invariant } from '@apollo/client/utilities/invariant';
const QUERY_REFERENCE_SYMBOL = Symbol.for('apollo.internal.queryRef');
const PROMISE_SYMBOL = Symbol.for('apollo.internal.refPromise');
export function wrapQueryRef(internalQueryRef) {
	return {
		[QUERY_REFERENCE_SYMBOL]: internalQueryRef,
		[PROMISE_SYMBOL]: internalQueryRef.promise,
	};
}
export function assertWrappedQueryRef(queryRef) {
	invariant(!queryRef || QUERY_REFERENCE_SYMBOL in queryRef, 27);
}
export function getWrappedPromise(queryRef) {
	const internalQueryRef = unwrapQueryRef(queryRef);
	return internalQueryRef.promise.status === 'fulfilled'
		? internalQueryRef.promise
		: queryRef[PROMISE_SYMBOL];
}
export function unwrapQueryRef(queryRef) {
	return queryRef[QUERY_REFERENCE_SYMBOL];
}
export function updateWrappedQueryRef(queryRef, promise) {
	queryRef[PROMISE_SYMBOL] = promise;
}
const OBSERVED_CHANGED_OPTIONS = [
	'context',
	'errorPolicy',
	'fetchPolicy',
	'refetchOn',
	'refetchWritePolicy',
	'returnPartialData',
];
export class InternalQueryReference {
	result;
	key = {};
	observable;
	promise;
	queue;
	subscription;
	listeners = new Set();
	autoDisposeTimeoutId;
	resolve;
	reject;
	references = 0;
	softReferences = 0;
	constructor(observable, options) {
		this.handleNext = this.handleNext.bind(this);
		this.dispose = this.dispose.bind(this);
		this.observable = observable;
		if (options.onDispose) {
			this.onDispose = options.onDispose;
		}
		this.setResult();
		this.subscribeToQuery();
		// Start a timer that will automatically dispose of the query if the
		// suspended resource does not use this queryRef in the given time. This
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
		// We wait until the request has settled to ensure we don't dispose of the
		// query ref before the request finishes, otherwise we would leave the
		// promise in a pending state rendering the suspense boundary indefinitely.
		this.promise.then(startDisposeTimer, startDisposeTimer);
	}
	get disposed() {
		return this.subscription.closed;
	}
	get watchQueryOptions() {
		return this.observable.options;
	}
	reinitialize() {
		const { observable } = this;
		const originalFetchPolicy = this.watchQueryOptions.fetchPolicy;
		const avoidNetworkRequests =
			originalFetchPolicy === 'no-cache' || originalFetchPolicy === 'standby';
		try {
			if (avoidNetworkRequests) {
				observable.applyOptions({ fetchPolicy: 'standby' });
			} else {
				observable.reset();
				observable.applyOptions({ fetchPolicy: 'cache-first' });
			}
			if (!avoidNetworkRequests) {
				this.setResult();
			}
			this.subscribeToQuery();
		} finally {
			observable.applyOptions({ fetchPolicy: originalFetchPolicy });
		}
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
	softRetain() {
		this.softReferences++;
		let disposed = false;
		return () => {
			// Tracking if this has already been called helps ensure that
			// multiple calls to this function won't decrement the reference
			// counter more than it should. Subsequent calls just result in a noop.
			if (disposed) {
				return;
			}
			disposed = true;
			this.softReferences--;
			setTimeout(() => {
				if (!this.softReferences && !this.references) {
					this.dispose();
				}
			});
		};
	}
	didChangeOptions(watchQueryOptions) {
		return OBSERVED_CHANGED_OPTIONS.some(
			(option) =>
				option in watchQueryOptions &&
				!equal(this.watchQueryOptions[option], watchQueryOptions[option]),
		);
	}
	applyOptions(watchQueryOptions) {
		const { fetchPolicy: currentFetchPolicy } = this.watchQueryOptions;
		// "standby" is used when `skip` is set to `true`. Detect when we've
		// enabled the query (i.e. `skip` is `false`) to execute a network request.
		if (currentFetchPolicy === 'standby' && currentFetchPolicy !== watchQueryOptions.fetchPolicy) {
			this.initiateFetch(this.observable.reobserve(watchQueryOptions));
		} else {
			this.observable.applyOptions(watchQueryOptions);
		}
		return this.promise;
	}
	listen(listener) {
		this.listeners.add(listener);
		if (this.queue) {
			this.deliver(this.queue);
			this.queue = undefined;
		}
		return () => {
			this.listeners.delete(listener);
		};
	}
	refetch(variables) {
		return this.initiateFetch(this.observable.refetch(variables));
	}
	fetchMore(options) {
		return this.initiateFetch(this.observable.fetchMore(options));
	}
	dispose() {
		this.subscription.unsubscribe();
	}
	onDispose() {
		// noop. overridable by options
	}
	handleNext(result) {
		switch (this.promise.status) {
			case 'pending': {
				// Maintain the last successful `data` value if the next result does not
				// have one.
				// TODO: This can likely be removed once
				// https://github.com/apollographql/apollo-client/issues/12667 is fixed
				if (result.data === void 0) {
					result.data = this.result.data;
					if (result.data) {
						result.dataState = 'complete';
					}
				}
				if (this.shouldReject(result)) {
					this.reject?.(result.error);
				} else {
					this.result = result;
					this.resolve?.(result);
				}
				break;
			}
			default: {
				// This occurs when switching to a result that is fully cached when this
				// class is instantiated. ObservableQuery will run reobserve when
				// subscribing, which delivers a result from the cache.
				if (
					result.data === this.result.data &&
					result.networkStatus === this.result.networkStatus
				) {
					return;
				}
				// Maintain the last successful `data` value if the next result does not
				// have one.
				if (result.data === void 0) {
					result.data = this.result.data;
				}
				if (this.shouldReject(result)) {
					this.promise = createRejectedPromise(result.error);
					this.deliver(this.promise);
				} else {
					this.result = result;
					this.promise = createFulfilledPromise(result);
					this.deliver(this.promise);
				}
				break;
			}
		}
	}
	deliver(promise) {
		// Maintain a queue of the last item we tried to deliver so that we can
		// deliver it as soon as we get the first listener. This helps in cases such
		// as `@stream` where React may render a component and incremental results
		// are loaded in between when the component renders and effects are run. If
		// effects are run after the incremntal chunks are delivered, we'll have
		// rendered a stale value. The queue ensures we can deliver the most
		// up-to-date value as soon as the component is ready to listen for new
		// values.
		if (this.listeners.size === 0) {
			this.queue = promise;
		}
		this.listeners.forEach((listener) => listener(promise));
	}
	initiateFetch(returnedPromise) {
		this.promise = this.createPendingPromise();
		this.promise.catch(() => {});
		// If the data returned from the fetch is deeply equal to the data already
		// in the cache, `handleNext` will not be triggered leaving the promise we
		// created in a pending state forever. To avoid this situation, we attempt
		// to resolve the promise if `handleNext` hasn't been run to ensure the
		// promise is resolved correctly.
		returnedPromise
			.then(() => {
				// In the case of `fetchMore`, this promise is resolved before a cache
				// result is emitted due to the fact that `fetchMore` sets a `no-cache`
				// fetch policy and runs `cache.batch` in its `.then` handler. Because
				// the timing is different, we accidentally run this update twice
				// causing an additional re-render with the `fetchMore` result by
				// itself. By wrapping in `setTimeout`, this should provide a short
				// delay to allow the `QueryInfo.notify` handler to run before this
				// promise is checked.
				// See https://github.com/apollographql/apollo-client/issues/11315 for
				// more information
				setTimeout(() => {
					if (this.promise.status === 'pending') {
						// Use the current result from the observable instead of the value
						// resolved from the promise. This avoids issues in some cases where
						// the raw resolved value should not be the emitted value, such as
						// when a `fetchMore` call returns an empty array after it has
						// reached the end of the list.
						//
						// See the following for more information:
						// https://github.com/apollographql/apollo-client/issues/11642
						this.result = this.observable.getCurrentResult();
						this.resolve?.(this.result);
					}
				});
			})
			.catch((error) => this.reject?.(error));
		return returnedPromise;
	}
	subscribeToQuery() {
		this.subscription = this.observable
			.pipe(filter((result) => !equal(result, this.result)))
			.subscribe(this.handleNext);
		// call `onDispose` when the subscription is finalized, either because it is
		// unsubscribed as a consequence of a `dispose` call or because the
		// ObservableQuery completes because of a `ApolloClient.stop()` call.
		this.subscription.add(this.onDispose);
	}
	setResult() {
		const result = this.observable.getCurrentResult();
		if (equal(result, this.result)) {
			return;
		}
		this.result = result;
		this.promise = result.data ? createFulfilledPromise(result) : this.createPendingPromise();
	}
	shouldReject(result) {
		const { errorPolicy = 'none' } = this.watchQueryOptions;
		return result.error && errorPolicy === 'none';
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
