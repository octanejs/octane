import { NetworkStatus } from '@apollo/client';
import { maybeDeepFreeze } from '@apollo/client/utilities/internal';

import { skipToken } from '../hooks/constants.js';
import { useApolloClient } from '../hooks/useApolloClient.js';
import { useQuery } from '../hooks/useQuery.js';

const skipStandbyResult = maybeDeepFreeze({
	loading: false,
	data: undefined,
	dataState: 'empty',
	error: undefined,
	networkStatus: NetworkStatus.ready,
	partial: true,
});

function withoutObservableAccess(value) {
	Object.defineProperty(value, 'observable', {
		get() {
			throw new Error(
				'"observable" property is not accessible on skipped hooks or hook calls with `ssr: false` during SSR',
			);
		},
	});
	return value;
}

// Matches Apollo Client 4.2.6's SSR hook while using Octane's provider and
// call-site-slotted useApolloClient. The prepass owns the observable lifetime.
export const useSSRQuery = function (query, options = {}) {
	'use no memo';

	function notAllowed() {
		throw new Error('This method cannot be called during SSR.');
	}

	const client = useApolloClient(typeof options === 'object' ? options.client : undefined);
	const baseResult = {
		client,
		refetch: notAllowed,
		fetchMore: notAllowed,
		subscribeToMore: notAllowed,
		updateQuery: notAllowed,
		startPolling: notAllowed,
		stopPolling: notAllowed,
		variables: typeof options === 'object' ? options.variables : undefined,
		previousData: undefined,
	};

	if (options === skipToken || options.skip || options.fetchPolicy === 'standby') {
		return withoutObservableAccess({ ...baseResult, ...skipStandbyResult });
	}

	if (options.ssr === false || options.fetchPolicy === 'no-cache') {
		return withoutObservableAccess({ ...baseResult, ...useQuery.ssrDisabledResult });
	}

	let observable = this.getObservableQuery(query, options.variables);
	if (!observable) {
		observable = client.watchQuery({
			query,
			...options,
			fetchPolicy:
				options.fetchPolicy === 'network-only' || options.fetchPolicy === 'cache-and-network'
					? 'cache-first'
					: options.fetchPolicy,
		});
		this.onCreatedObservableQuery(observable, query, options.variables);
	}

	return {
		observable,
		...observable.getCurrentResult(),
		...baseResult,
	};
};
