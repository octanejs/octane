import {
	assertWrappedQueryRef,
	getWrappedPromise,
	InternalQueryReference,
	wrapQueryRef,
} from '@octanejs/apollo-client/react/internal';
import { FinalizationRegistry } from '@apollo/client/utilities/internal/ponyfills';
import { wrapHook } from '../hooks/internal/index.js';
/**
 * A higher order function that returns a `preloadQuery` function which
 * can be used to begin loading a query with the given `client`. This is useful
 * when you want to start loading a query as early as possible outside of a
 * React component.
 *
 * > Refer to the [Suspense - Initiating queries outside React](https://www.apollographql.com/docs/react/data/suspense#initiating-queries-outside-react) section for a more in-depth overview.
 *
 * @param client - The `ApolloClient` instance that will be used to load queries
 * from the returned `preloadQuery` function.
 * @returns The `preloadQuery` function.
 *
 * @example
 *
 * ```js
 * const preloadQuery = createQueryPreloader(client);
 * ```
 */
export function createQueryPreloader(client) {
	return wrapHook('createQueryPreloader', _createQueryPreloader, client)(client);
}
const _createQueryPreloader = (client) => {
	function preloadQuery(query, options = {}) {
		const queryRef = new InternalQueryReference(
			client.watchQuery({
				...options,
				query,
				notifyOnNetworkStatusChange: false,
			}),
			{
				autoDisposeTimeoutMs: client.defaultOptions.react?.suspense?.autoDisposeTimeoutMs,
			},
		);
		const wrapped = wrapQueryRef(queryRef);
		softRetainWhileReferenced(wrapped, queryRef);
		return wrapped;
	}
	return Object.assign(preloadQuery, {
		toPromise(queryRef) {
			assertWrappedQueryRef(queryRef);
			return getWrappedPromise(queryRef).then(() => queryRef);
		},
	});
};
/**
 * Soft-retains the underlying `InternalQueryReference` while the `PreloadedQueryRef`
 * is still reachable.
 * When the `PreloadedQueryRef` is garbage collected, the soft retain is
 * disposed of, but only after the initial query has finished loading.
 * Once the `InternalQueryReference` is properly retained, the check for garbage
 * collection is unregistered and the soft retain is disposed of immediately.
 */
// this is an individual function to avoid closing over any values more than necessary
function softRetainWhileReferenced(wrapped, queryRef) {
	const { softDispose, delayedSoftDispose } = getCleanup(queryRef);
	registry.register(wrapped, delayedSoftDispose, queryRef);
	// This will unregister the cleanup from the finalization registry when
	// the queryRef is properly retained.
	// This is mostly done to keep the FinalizationRegistry from holding too many
	// cleanup functions, as our React Native polyfill has to iterate all of them regularly.
	queryRef.retain = unregisterOnRetain(queryRef.retain, softDispose);
}
// this is an individual function to avoid closing over any values more than necessary
function unregisterOnRetain(originalRetain, softDispose) {
	return function (...args) {
		registry.unregister(this);
		const dispose = originalRetain.apply(this, args);
		softDispose();
		return dispose;
	};
}
// this is an individual function to avoid closing over any values more than necessary
function getCleanup(queryRef) {
	const softDispose = queryRef.softRetain();
	const initialPromise = queryRef.promise;
	return {
		softDispose,
		delayedSoftDispose: () => initialPromise.finally(softDispose).catch(() => {}),
	};
}
const registry = new FinalizationRegistry((cleanup) => cleanup());
