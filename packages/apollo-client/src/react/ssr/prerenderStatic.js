import { print } from 'graphql';
import { createElement } from 'octane';
import { filter, firstValueFrom } from 'rxjs';
import { canonicalStringify } from '@apollo/client/utilities';
import { invariant } from '@apollo/client/utilities/invariant';

import { getApolloContext } from '../context/ApolloContext.js';
import { wrapperSymbol } from '../internal/index.js';
import { useSSRQuery } from './useSSRQuery.js';

function getObservableQueryKey(query, variables = {}) {
	return `${print(query)}|${canonicalStringify(variables)}`;
}

const noopObserver = { complete() {} };

/**
 * Render an Octane tree repeatedly until Apollo's non-suspending useQuery
 * operations settle. The final Octane render result retains its scoped CSS.
 */
export function prerenderStatic({
	tree,
	context = {},
	renderFunction,
	signal,
	ignoreResults,
	diagnostics,
	maxRerenders = 50,
}) {
	const availableObservableQueries = new Map();
	const subscriptions = new Set();
	const recentlyCreatedObservableQueries = new Set();
	let renderCount = 0;

	const internalContext = {
		getObservableQuery(query, variables) {
			return availableObservableQueries.get(getObservableQueryKey(query, variables));
		},
		onCreatedObservableQuery(observable, query, variables) {
			availableObservableQueries.set(getObservableQueryKey(query, variables), observable);
			subscriptions.add(observable.subscribe(noopObserver));
			if (observable.options.fetchPolicy !== 'cache-only') {
				recentlyCreatedObservableQueries.add(observable);
			}
		},
	};

	async function process() {
		renderCount += 1;
		invariant(renderCount <= maxRerenders, 25, maxRerenders);
		invariant(!signal?.aborted, 26);

		const ApolloContext = getApolloContext();
		const child = typeof tree === 'function' ? createElement(tree, {}) : tree;
		function ApolloSSRTree() {
			return createElement(ApolloContext.Provider, {
				value: {
					...context,
					[wrapperSymbol]: {
						useQuery: () => useSSRQuery.bind(internalContext),
					},
				},
				children: child,
			});
		}

		const renderFnResult = await renderFunction(ApolloSSRTree);
		const result = consume(renderFnResult, ignoreResults);
		if (recentlyCreatedObservableQueries.size === 0) {
			return { result, renderFnResult, aborted: signal?.aborted ?? false };
		}
		if (signal?.aborted) {
			return { result, renderFnResult, aborted: true };
		}

		const dataPromise = Promise.all(
			Array.from(recentlyCreatedObservableQueries, async (observable) => {
				await firstValueFrom(observable.pipe(filter((value) => value.loading === false)));
				recentlyCreatedObservableQueries.delete(observable);
			}),
		);

		if (signal) {
			let resolveAbort;
			const abortPromise = new Promise((resolve) => {
				resolveAbort = resolve;
			});
			signal.addEventListener('abort', resolveAbort);
			try {
				await Promise.race([abortPromise, dataPromise]);
			} finally {
				signal.removeEventListener('abort', resolveAbort);
			}
		} else {
			await dataPromise;
		}

		if (signal?.aborted) {
			return { result, renderFnResult, aborted: true };
		}
		return process();
	}

	return Promise.resolve()
		.then(process)
		.then((result) => (diagnostics ? { ...result, diagnostics: { renderCount } } : result))
		.finally(() => {
			availableObservableQueries.clear();
			recentlyCreatedObservableQueries.clear();
			for (const subscription of subscriptions) subscription.unsubscribe();
			subscriptions.clear();
		});
}

function consume(value, ignoreResults) {
	if (typeof value === 'string') return ignoreResults ? '' : value;
	if (value && typeof value.html === 'string' && typeof value.css === 'string') {
		return ignoreResults ? '' : value.html;
	}
	throw new Error(
		'`prerenderStatic` requires an Octane renderer returning `{ html, css }` or a string.',
	);
}
