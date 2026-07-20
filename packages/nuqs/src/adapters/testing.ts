import { createElement, useCallback, useEffect, useRef, useState, type OctaneNode } from 'octane';
import { resetQueues } from '../lib/queues/reset';
import { renderQueryString } from './custom';
import { context, type AdapterProps } from './lib/context';
import type { AdapterInterface, AdapterOptions } from './lib/defs';

export type UrlUpdateEvent = {
	searchParams: URLSearchParams;
	queryString: string;
	options: Required<AdapterOptions>;
};

export type OnUrlUpdateFunction = (event: UrlUpdateEvent) => void;

type TestingAdapterProps = Pick<AdapterInterface, 'autoResetQueueOnUpdate'> & {
	/**
	 * An initial value for the search params.
	 */
	searchParams?: string | Record<string, string> | URLSearchParams;

	/**
	 * A function that will be called whenever the URL is updated.
	 * Connect that to a spy in your tests to assert the URL updates.
	 */
	onUrlUpdate?: OnUrlUpdateFunction;

	/**
	 * Internal: enable throttling during tests.
	 *
	 * @default 0 (no throttling)
	 */
	rateLimitFactor?: number;

	/**
	 * Internal: Whether to reset the url update queue on mount.
	 *
	 * Since the update queue is a shared global, each test clears
	 * it on mount to avoid interference between tests.
	 *
	 * @default true
	 */
	resetUrlUpdateQueueOnMount?: boolean;

	/**
	 * If true, the adapter will store the search params in memory and
	 * update that memory on each updateUrl call, to simulate a real adapter.
	 *
	 * Otherwise, the search params will be frozen to the initial value.
	 *
	 * @default false
	 */
	hasMemory?: boolean;

	children: OctaneNode;
} & AdapterProps;

function renderInitialSearchParams(searchParams: TestingAdapterProps['searchParams']): string {
	if (!searchParams) {
		return '';
	}
	if (typeof searchParams === 'string') {
		return searchParams;
	}
	if (searchParams instanceof URLSearchParams) {
		return searchParams.toString();
	}
	return new URLSearchParams(searchParams).toString();
}

export function NuqsTestingAdapter({
	resetUrlUpdateQueueOnMount = true,
	autoResetQueueOnUpdate = true,
	defaultOptions,
	processUrlSearchParams,
	rateLimitFactor = 0,
	hasMemory = false,
	onUrlUpdate,
	children,
	searchParams: initialSearchParams = '',
}: TestingAdapterProps): OctaneNode {
	const renderedInitialSearchParams = renderInitialSearchParams(initialSearchParams);
	// Simulate a central location.search in memory
	// for the getSearchParamsSnapshot to be referentially stable.
	const locationSearchRef = useRef(renderedInitialSearchParams);
	// Reset the shared update queue ONCE per mount, during the first render, so a
	// previous test's leftover queued updates can't leak into this tree's initial
	// parse. It must run during render (not a mount effect): child useQueryStates
	// reads the queue via useQueuedQueries during its OWN first render, which
	// happens after this provider renders — an effect would run too late and the
	// first child render would parse a dirty queue. The ref guard keeps it to the
	// first render only, so re-renders (e.g. hasMemory's setSearchParams after a
	// flush) don't re-abort the queue and drop in-flight/follow-up URL writes.
	// DIVERGENCE FROM nuqs: upstream runs resetQueues() on every render; the guard
	// is octane-side only and is safe because octane has no StrictMode
	// double-invoke of render, so the reset still fires exactly once on mount.
	const didResetQueueRef = useRef(false);
	if (resetUrlUpdateQueueOnMount && !didResetQueueRef.current) {
		didResetQueueRef.current = true;
		resetQueues();
	}
	const [searchParams, setSearchParams] = useState(
		() => new URLSearchParams(locationSearchRef.current),
	);
	useEffect(() => {
		if (!hasMemory) {
			return;
		}
		const synced = new URLSearchParams(initialSearchParams);
		setSearchParams(synced);
		locationSearchRef.current = synced.toString();
	}, [hasMemory, renderedInitialSearchParams]);
	const updateUrl = useCallback<AdapterInterface['updateUrl']>(
		(search, options) => {
			const queryString = renderQueryString(search);
			const searchParams = new URLSearchParams(search); // make a copy
			if (hasMemory) {
				setSearchParams(searchParams);
				locationSearchRef.current = queryString;
			}
			onUrlUpdate?.({
				searchParams,
				queryString,
				options,
			});
		},
		[onUrlUpdate, hasMemory],
	);
	const getSearchParamsSnapshot = useCallback(() => {
		return new URLSearchParams(locationSearchRef.current);
	}, [renderedInitialSearchParams]);
	const useAdapter = (): AdapterInterface => ({
		searchParams,
		updateUrl,
		getSearchParamsSnapshot,
		rateLimitFactor,
		autoResetQueueOnUpdate,
	});
	return createElement(
		context.Provider,
		{ value: { useAdapter, defaultOptions, processUrlSearchParams } },
		children,
	);
}

/**
 * A higher order component that wraps the children with the NuqsTestingAdapter
 *
 * It allows creating wrappers for testing purposes by providing only the
 * necessary props to the NuqsTestingAdapter.
 *
 * Usage:
 * ```tsx
 * render(<MyComponent />, {
 *   wrapper: withNuqsTestingAdapter({ searchParams: '?foo=bar' })
 * })
 * ```
 */
export function withNuqsTestingAdapter(props: Omit<TestingAdapterProps, 'children'> = {}) {
	return function NuqsTestingAdapterWrapper({ children }: { children: OctaneNode }): OctaneNode {
		return createElement(
			NuqsTestingAdapter,
			// @ts-expect-error - Ignore missing children error
			props,
			children,
		);
	};
}
