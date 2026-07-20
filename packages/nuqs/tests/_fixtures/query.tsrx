import { NuqsTestingAdapter, type OnUrlUpdateFunction } from '@octanejs/nuqs/adapters/testing';
import { NuqsAdapter } from '@octanejs/nuqs/adapters/react';
import { parseAsInteger, parseAsString, useQueryState, useQueryStates } from '@octanejs/nuqs';

// Conformance fixtures — octane-side behavior of the binding. Each app is
// wrapped in <NuqsTestingAdapter hasMemory> so setter calls flow back through
// the adapter's in-memory search params and reconcile into hook state, exactly
// as a real router adapter would.

// Single key, integer parser with a default value. Missing key → default (0),
// never written to the URL until it diverges.
function Counter() @{
	const [count, setCount] = useQueryState('count', parseAsInteger.withDefault(0));
	<div>
		<span id="count">
			{'count=' + count as number}
		</span>
		<button id="inc" onClick={() => setCount((c) => (c ?? 0) + 1)}>{'inc'}</button>
		<button id="clear" onClick={() => setCount(null)}>{'clear'}</button>
	</div>
}

export function CounterApp(props: {
	searchParams?: string;
	onUrlUpdate?: OnUrlUpdateFunction;
}) @{
	<NuqsTestingAdapter
		searchParams={props.searchParams ?? ''}
		onUrlUpdate={props.onUrlUpdate}
		hasMemory={true}
	>
		<Counter />
	</NuqsTestingAdapter>
}

// Multiple keys in one hook: a string search and an integer page, each with a
// default. One setter call updates both.
function Filters() @{
	const [{ q, page }, setFilters] = useQueryStates({
		q: parseAsString.withDefault(''),
		page: parseAsInteger.withDefault(1),
	});
	<div>
		<span id="q">
			{'q=' + q as string}
		</span>
		<span id="page">
			{'page=' + page as number}
		</span>
		<button id="set" onClick={() => setFilters({ q: 'hello', page: 2 })}>{'set'}</button>
		<button
			id="next"
			onClick={() => setFilters((old) => ({ page: old.page + 1 }))}
		>{'next'}</button>
		<button id="reset" onClick={() => setFilters(null)}>{'reset'}</button>
	</div>
}

export function FiltersApp(props: {
	searchParams?: string;
	onUrlUpdate?: OnUrlUpdateFunction;
}) @{
	<NuqsTestingAdapter
		searchParams={props.searchParams ?? ''}
		onUrlUpdate={props.onUrlUpdate}
		hasMemory={true}
	>
		<Filters />
	</NuqsTestingAdapter>
}

// The real, router-less react adapter: reads window.location.search through
// useSyncExternalStore and writes via history.replaceState/pushState.
export function CounterAppReact() @{
	<NuqsAdapter>
		<Counter />
	</NuqsAdapter>
}
