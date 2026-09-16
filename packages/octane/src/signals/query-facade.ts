import { createResourceCellWith } from './engine.js';
import { Descriptor, descriptorKey, signalOptionsKey } from './facade.js';
import { runWithSignalOwner } from './owner-context.js';
import { initializeResource, query as createQueryRequest } from './requests.js';
import {
	skip,
	type QueryContext,
	type QueryLoadResult,
	type QueryOptions,
	type QuerySignal,
	type SignalOptions,
} from './types.js';

// Keep query factories out of the shared owner facade: a cold query entry must
// not make an eager signal-only entry import its producer implementation.
class QueryDescriptor<T> extends Descriptor<T, QuerySignal<T>> implements QuerySignal<T> {
	declare readonly kind: 'async';

	refetch(): void {
		this.resolve().retry();
	}

	reset(): void {
		this.resolve().retry({ pending: true });
	}

	retry(options?: { pending?: boolean }): void {
		this.resolve().retry(options);
	}
}

export function __queryAt<A, T>(
	site: string | undefined,
	select: () => A | typeof skip,
	load: (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
	options?: QueryOptions & SignalOptions,
): QuerySignal<T> {
	if (typeof select !== 'function' || typeof load !== 'function') {
		throw new TypeError('query$ requires selector and loader functions.');
	}
	const explicit = signalOptionsKey(options);
	site ??= explicit;
	const authoredKey = descriptorKey(site, explicit);
	const key =
		explicit !== undefined && (site?.startsWith('g:') || site?.startsWith('i:'))
			? site.slice(0, 2) + authoredKey
			: authoredKey;
	const request = (
		createQueryRequest as unknown as (
			key: string,
			load: (selection: A, context: QueryContext) => unknown,
			options?: QueryOptions,
		) => (selection: A) => import('./types.js').QueryRequest<T>
	)(key, load as unknown as (selection: A, context: QueryContext) => unknown, options);
	return new QueryDescriptor(
		key,
		'async',
		(owner) =>
			createResourceCellWith(
				owner,
				key,
				() => {
					const selection = runWithSignalOwner(owner, select);
					return selection === skip ? skip : request(selection);
				},
				initializeResource,
			) as QuerySignal<T>,
		site,
	);
}

export function query$<A, T>(
	select: () => A | typeof skip,
	load: (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
	options?: QueryOptions & SignalOptions,
): QuerySignal<T> {
	return __queryAt(undefined, select, load, options);
}
