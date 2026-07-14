import {
	ApolloClient,
	ApolloLink,
	InMemoryCache,
	Observable,
	makeVar,
	type FetchResult,
} from '@apollo/client';
import { describe, expect, it, vi } from 'vitest';

import {
	GET_MOCKED_VALUE,
	GET_VALUE,
	FragmentApp,
	ITEM_FRAGMENT,
	LazyQueryApp,
	MockedProviderApp,
	MockedProviderBlockApp,
	MutationApp,
	ProviderApp,
	QueryApp,
	ReactiveVarApp,
	SkippedSuspenseQueryApp,
	SubscriptionApp,
	SuspenseQueryApp,
	TwinQueryApp,
} from '../_fixtures/client.tsrx';
import { flushEffects, mount, settle } from '../_helpers';

type PendingOperation = {
	operationName: string;
	variables: Record<string, unknown>;
	resolve(data: Record<string, unknown>): void;
	next(data: Record<string, unknown>): void;
	complete(): void;
	fail(error: Error): void;
};

function createControlledClient() {
	const operations: PendingOperation[] = [];
	const link = new ApolloLink(
		(operation) =>
			new Observable<FetchResult>((observer) => {
				operations.push({
					operationName: operation.operationName,
					variables: operation.variables,
					resolve(data) {
						observer.next({ data });
						observer.complete();
					},
					next(data) {
						observer.next({ data });
					},
					complete() {
						observer.complete();
					},
					fail(error) {
						observer.error(error);
					},
				});
			}),
	);
	const client = new ApolloClient({ cache: new InMemoryCache(), link });
	return { client, operations };
}

describe('@octanejs/apollo-client client hooks', () => {
	it('ApolloProvider supplies useApolloClient and the explicit override wins', () => {
		const context = createControlledClient().client;
		const override = createControlledClient().client;
		let receivedContext: ApolloClient | undefined;
		let receivedOverride: ApolloClient | undefined;
		const mounted = mount(ProviderApp, {
			client: context,
			override,
			onClient(client) {
				receivedContext = client;
			},
			onOverride(client) {
				receivedOverride = client;
			},
		});

		try {
			expect(receivedContext).toBe(context);
			expect(receivedOverride).toBe(override);
		} finally {
			mounted.unmount();
			context.stop();
			override.stop();
		}
	});

	it('useQuery renders loading, receives network data, and follows cache writes', async () => {
		const { client, operations } = createControlledClient();
		const mounted = mount(QueryApp, { client });

		try {
			expect(mounted.find('#query-result').textContent).toBe('loading');
			await settle();
			expect(operations).toHaveLength(1);
			expect(operations[0].operationName).toBe('GetValue');

			operations[0].resolve({ value: 'network' });
			await settle();
			expect(mounted.find('#query-result').textContent).toBe('data:network');

			client.writeQuery({ query: GET_VALUE, data: { value: 'cached' } });
			await settle();
			expect(mounted.find('#query-result').textContent).toBe('data:cached');
		} finally {
			mounted.unmount();
			client.stop();
		}
	});

	it('useSuspenseQuery renders a fallback while pending and data after Octane use() resolves', async () => {
		const { client, operations } = createControlledClient();
		const mounted = mount(SuspenseQueryApp, { client });

		try {
			expect(mounted.find('#suspense-query-fallback').textContent).toBe('pending');
			await settle();
			expect(operations).toHaveLength(1);
			expect(operations[0].operationName).toBe('GetValue');

			operations[0].resolve({ value: 'suspense-ready' });
			await settle();
			expect(mounted.find('#suspense-query-result').textContent).toBe('data:suspense-ready');
		} finally {
			mounted.unmount();
			client.stop();
		}
	});

	it('useSuspenseQuery preserves skipToken instead of treating it as the compiler site', async () => {
		const { client, operations } = createControlledClient();
		const mounted = mount(SkippedSuspenseQueryApp, { client });

		try {
			expect(mounted.find('#skipped-suspense-query-result').textContent).toBe('data:-');
			expect(mounted.container.querySelector('#skipped-suspense-query-fallback')).toBeNull();
			await settle();
			expect(operations).toHaveLength(0);
		} finally {
			mounted.unmount();
			client.stop();
		}
	});

	it('keeps two useQuery call sites independent and accepts out-of-order results', async () => {
		const { client, operations } = createControlledClient();
		const mounted = mount(TwinQueryApp, { client });

		try {
			expect(mounted.find('#first-query-result').textContent).toBe('loading');
			expect(mounted.find('#second-query-result').textContent).toBe('loading');
			await settle();
			expect(operations).toHaveLength(2);

			const first = operations.find((operation) => operation.variables.id === 'first');
			const second = operations.find((operation) => operation.variables.id === 'second');
			expect(first).toBeDefined();
			expect(second).toBeDefined();

			second!.resolve({
				item: { __typename: 'Item', id: 'second', value: 'second-result' },
			});
			await settle();
			expect(mounted.find('#first-query-result').textContent).toBe('loading');
			expect(mounted.find('#second-query-result').textContent).toBe('data:second-result');

			first!.resolve({
				item: { __typename: 'Item', id: 'first', value: 'first-result' },
			});
			await settle();
			expect(mounted.find('#first-query-result').textContent).toBe('data:first-result');
			expect(mounted.find('#second-query-result').textContent).toBe('data:second-result');
		} finally {
			mounted.unmount();
			client.stop();
		}
	});

	it('keeps useFragment identifier and options deep memos independent', async () => {
		const { client } = createControlledClient();
		client.cache.writeFragment({
			fragment: ITEM_FRAGMENT,
			data: { __typename: 'Item', id: 'first', value: 'one' },
		});
		client.cache.writeFragment({
			fragment: ITEM_FRAGMENT,
			data: { __typename: 'Item', id: 'second', value: 'two' },
		});
		const watchFragment = vi.spyOn(client, 'watchFragment');
		let renders = 0;
		const onRender = () => {
			renders++;
		};
		const mounted = mount(FragmentApp, {
			client,
			from: { __typename: 'Item', id: 'first' },
			onRender,
		});

		try {
			expect(mounted.find('#fragment-result').textContent).toBe('complete:one');
			expect(watchFragment).toHaveBeenCalledTimes(1);
			await settle();

			client.cache.writeFragment({
				fragment: ITEM_FRAGMENT,
				id: 'Item:first',
				data: { __typename: 'Item', id: 'first', value: 'one-updated' },
			});
			await settle(1);
			expect(mounted.find('#fragment-result').textContent).toBe('complete:one-updated');
			expect(renders).toBeGreaterThan(1);
			// A cache-driven rerender must reuse the watchFragment options object.
			expect(watchFragment).toHaveBeenCalledTimes(1);

			mounted.update(FragmentApp, {
				client,
				from: { __typename: 'Item', id: 'second' },
				onRender,
			});
			expect(mounted.find('#fragment-result').textContent).toBe('complete:two');
			expect(watchFragment).toHaveBeenCalledTimes(2);
		} finally {
			mounted.unmount();
			watchFragment.mockRestore();
			client.stop();
		}
	});

	it('useMutation exposes idle, loading, and fulfilled results', async () => {
		const { client, operations } = createControlledClient();
		const mounted = mount(MutationApp, { client });

		try {
			expect(mounted.find('#mutation-result').textContent).toBe('idle');
			mounted.click('#mutate');
			expect(mounted.find('#mutation-result').textContent).toBe('loading');
			expect(operations).toHaveLength(1);
			expect(operations[0]).toMatchObject({
				operationName: 'SaveValue',
				variables: { value: 'saved' },
			});

			operations[0].resolve({ saveValue: 'saved' });
			await settle();
			expect(mounted.find('#mutation-result').textContent).toBe('data:saved');
		} finally {
			mounted.unmount();
			client.stop();
		}
	});

	it('useReactiveVar subscribes and rerenders when the variable changes', async () => {
		const valueVar = makeVar('initial');
		const mounted = mount(ReactiveVarApp, { valueVar });

		try {
			expect(mounted.find('#reactive-var-value').textContent).toBe('initial');
			await settle();
			mounted.click('#update-var');
			expect(mounted.find('#reactive-var-value').textContent).toBe('updated');
		} finally {
			mounted.unmount();
		}
	});

	it('useSubscription receives multiple pushed results without recreating the stream', async () => {
		const { client, operations } = createControlledClient();
		const mounted = mount(SubscriptionApp, { client });

		try {
			expect(mounted.find('#subscription-result').textContent).toBe('loading');
			await settle();
			expect(operations).toHaveLength(1);
			expect(operations[0].operationName).toBe('ValueChanged');

			operations[0].next({ valueChanged: 'first' });
			await settle();
			expect(mounted.find('#subscription-result').textContent).toBe('data:first');
			expect(operations).toHaveLength(1);

			operations[0].next({ valueChanged: 'second' });
			await settle();
			expect(mounted.find('#subscription-result').textContent).toBe('data:second');
			expect(operations).toHaveLength(1);
			operations[0].complete();
		} finally {
			mounted.unmount();
			client.stop();
		}
	});

	it('useLazyQuery executes from an event and resolves its result', async () => {
		const { client, operations } = createControlledClient();
		const mounted = mount(LazyQueryApp, { client });

		try {
			expect(mounted.find('#lazy-query-result').textContent).toBe('idle');
			await settle();
			expect(operations).toHaveLength(0);

			mounted.click('#execute-lazy');
			expect(mounted.find('#lazy-query-result').textContent).toBe('loading');
			expect(operations).toHaveLength(1);
			operations[0].resolve({ value: 'lazy' });
			await settle();
			expect(mounted.find('#lazy-query-result').textContent).toBe('data:lazy');
		} finally {
			mounted.unmount();
			client.stop();
		}
	});

	it('useLazyQuery rejects execute calls made during render', () => {
		const { client, operations } = createControlledClient();
		try {
			expect(() =>
				mount(LazyQueryApp, {
					client,
					executeDuringRender: true,
				}),
			).toThrow();
			expect(operations).toHaveLength(0);
		} finally {
			client.stop();
		}
	});

	it('MockedProvider supplies a client, applies childProps, and resolves mocks', async () => {
		const mounted = mount(MockedProviderApp, {
			mocks: [
				{
					request: { query: GET_MOCKED_VALUE },
					result: { data: { mockedValue: 'mocked' } },
				},
			],
		});

		try {
			expect(mounted.find('#mocked-provider-label').textContent).toBe('from-child-props');
			expect(mounted.find('#mocked-provider-result').textContent).toBe('loading');
			await settle(1);
			expect(mounted.find('#mocked-provider-result').textContent).toBe('data:mocked');
		} finally {
			mounted.unmount();
			flushEffects();
		}
	});

	it('MockedProvider renders ordinary compiled block children', async () => {
		const mounted = mount(MockedProviderBlockApp, {
			mocks: [
				{
					request: { query: GET_MOCKED_VALUE },
					result: { data: { mockedValue: 'from-block' } },
				},
			],
		});

		try {
			expect(mounted.find('#mocked-provider-label').textContent).toBe('block-child');
			expect(mounted.find('#mocked-provider-result').textContent).toBe('loading');
			await settle(1);
			expect(mounted.find('#mocked-provider-result').textContent).toBe('data:from-block');
		} finally {
			mounted.unmount();
			flushEffects();
		}
	});
});
