import {
	ApolloClient,
	HttpLink,
	InMemoryCache,
	makeVar,
	type NormalizedCacheObject,
	type ReactiveVar,
} from '@octanejs/apollo-client';

export interface CinebaseApollo {
	client: ApolloClient;
	watchlist: ReactiveVar<string[]>;
}

// Apollo normally aborts an HttpLink request when a superseded observable is
// unsubscribed. Cinebase deliberately lets the deterministic fixture response
// finish so its E2E journey can prove that a late result cannot replace the
// currently selected variables. Observer unsubscribe behavior remains Apollo's.
const completeFixtureFetch: typeof fetch = (input, init) => {
	if (init === undefined) return fetch(input);
	const options = { ...init };
	delete options.signal;
	return fetch(input, options);
};

export function createCinebaseApollo(uri: string, state?: NormalizedCacheObject): CinebaseApollo {
	const cache = new InMemoryCache({
		typePolicies: {
			Title: { keyFields: ['id'] },
		},
	});
	if (state !== undefined) cache.restore(state);
	return {
		client: new ApolloClient({
			cache,
			link: new HttpLink({ uri, fetch: completeFixtureFetch }),
			ssrMode: typeof window === 'undefined',
		}),
		watchlist: makeVar<string[]>([]),
	};
}
