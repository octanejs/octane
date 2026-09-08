import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	ApolloClient,
	ApolloLink,
	InMemoryCache,
	Observable,
	makeVar,
	type FetchResult,
} from '@apollo/client';
import { createOctaneCompiler } from 'octane/compiler/bundler';
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
	QuerySourceApp,
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

type QuerySnapshot = {
	client: ApolloClient;
	observable: unknown;
	data: Record<string, unknown> | undefined;
	previousData: Record<string, unknown> | undefined;
	loading: boolean;
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
	it('keeps useQuery in compatibility mode because it mutates render snapshots', () => {
		const packageRoot = resolve(process.cwd(), 'packages/apollo-client');
		const filename = resolve(packageRoot, 'src/react/hooks/useQuery.js');
		const source = readFileSync(filename, 'utf8');
		const compiler = createOctaneCompiler({ root: packageRoot });

		expect(compiler.transform(source, filename)?.code).toEqual(expect.any(String));

		const strongCompiler = createOctaneCompiler({ root: packageRoot, strong: true });
		expect(() => strongCompiler.transform(source, filename)).toThrow(
			/OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION/,
		);
	});

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

	// Per @apollo/client@4.2.6 src/react/hooks/__tests__/useQuery.test.tsx:9621.
	it('should persist result.previousData even if query changes', async () => {
		const { client, operations } = createControlledClient();
		const watchQuery = vi.spyOn(client, 'watchQuery');
		const snapshots: QuerySnapshot[] = [];
		const onResult = (result: QuerySnapshot) => snapshots.push(result);
		const mounted = mount(QuerySourceApp, { client, query: GET_VALUE, onResult });

		try {
			expect(mounted.find('#query-source-status').textContent).toBe('loading');
			expect(mounted.find('#query-source-current').textContent).toBe('null');
			expect(mounted.find('#query-source-previous').textContent).toBe('null');
			await settle();
			expect(operations.map(({ operationName }) => operationName)).toEqual(['GetValue']);

			operations[0].resolve({ value: 'first-query' });
			await settle();
			expect(mounted.find('#query-source-current').textContent).toBe(
				JSON.stringify({ value: 'first-query' }),
			);
			const originalObservable = snapshots.at(-1)?.observable;
			const sourceChange = snapshots.length;

			mounted.update(QuerySourceApp, { client, query: GET_MOCKED_VALUE, onResult });
			expect(mounted.find('#query-source-status').textContent).toBe('loading');
			expect(mounted.find('#query-source-current').textContent).toBe('null');
			expect(mounted.find('#query-source-previous').textContent).toBe(
				JSON.stringify({ value: 'first-query' }),
			);
			expect(snapshots.slice(sourceChange)).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						client,
						data: undefined,
						loading: true,
						previousData: { value: 'first-query' },
					}),
				]),
			);
			expect(
				snapshots.slice(sourceChange).every(({ observable }) => observable !== originalObservable),
			).toBe(true);
			await settle();
			expect(operations.map(({ operationName }) => operationName)).toEqual([
				'GetValue',
				'GetMockedValue',
			]);
			expect(watchQuery).toHaveBeenCalledTimes(2);
			const replacementObservable = snapshots.at(-1)?.observable;

			operations[1].resolve({ mockedValue: 'second-query' });
			await settle();
			expect(mounted.find('#query-source-status').textContent).toBe('ready');
			expect(mounted.find('#query-source-current').textContent).toBe(
				JSON.stringify({ mockedValue: 'second-query' }),
			);
			expect(mounted.find('#query-source-previous').textContent).toBe(
				JSON.stringify({ value: 'first-query' }),
			);
			expect(snapshots.at(-1)?.observable).toBe(replacementObservable);

			mounted.update(QuerySourceApp, { client, query: GET_MOCKED_VALUE, onResult });
			await settle();
			expect(watchQuery).toHaveBeenCalledTimes(2);
			expect(operations.map(({ operationName }) => operationName)).toEqual([
				'GetValue',
				'GetMockedValue',
			]);
			expect(snapshots.at(-1)?.observable).toBe(replacementObservable);
		} finally {
			mounted.unmount();
			watchQuery.mockRestore();
			client.stop();
		}
	});

	it('switches Apollo clients without publishing stale query data or retaining the old observable', async () => {
		const first = createControlledClient();
		const second = createControlledClient();
		const firstWatchQuery = vi.spyOn(first.client, 'watchQuery');
		const secondWatchQuery = vi.spyOn(second.client, 'watchQuery');
		const snapshots: QuerySnapshot[] = [];
		const onResult = (result: QuerySnapshot) => snapshots.push(result);
		const mounted = mount(QuerySourceApp, {
			client: first.client,
			query: GET_VALUE,
			onResult,
		});

		try {
			await settle();
			expect(first.operations.map(({ operationName }) => operationName)).toEqual(['GetValue']);
			first.operations[0].resolve({ value: 'first-client' });
			await settle();
			expect(mounted.find('#query-source-current').textContent).toBe(
				JSON.stringify({ value: 'first-client' }),
			);
			const originalObservable = snapshots.at(-1)?.observable;
			const sourceChange = snapshots.length;

			mounted.update(QuerySourceApp, {
				client: second.client,
				query: GET_VALUE,
				onResult,
			});
			expect(mounted.find('#query-source-status').textContent).toBe('loading');
			expect(mounted.find('#query-source-current').textContent).toBe('null');
			expect(mounted.find('#query-source-previous').textContent).toBe(
				JSON.stringify({ value: 'first-client' }),
			);
			expect(
				snapshots
					.slice(sourceChange)
					.every(
						({ client, observable }) =>
							client === second.client && observable !== originalObservable,
					),
			).toBe(true);
			await settle();
			expect(firstWatchQuery).toHaveBeenCalledTimes(1);
			expect(secondWatchQuery).toHaveBeenCalledTimes(1);
			expect(second.operations.map(({ operationName }) => operationName)).toEqual(['GetValue']);

			first.client.writeQuery({ query: GET_VALUE, data: { value: 'retired-client' } });
			await settle();
			expect(mounted.find('#query-source-status').textContent).toBe('loading');
			expect(mounted.find('#query-source-current').textContent).toBe('null');
			expect(mounted.find('#query-source-previous').textContent).toBe(
				JSON.stringify({ value: 'first-client' }),
			);

			second.operations[0].resolve({ value: 'second-client' });
			await settle();
			expect(mounted.find('#query-source-status').textContent).toBe('ready');
			expect(mounted.find('#query-source-current').textContent).toBe(
				JSON.stringify({ value: 'second-client' }),
			);
			expect(mounted.find('#query-source-previous').textContent).toBe(
				JSON.stringify({ value: 'first-client' }),
			);
			expect(snapshots.at(-1)?.client).toBe(second.client);

			second.client.writeQuery({ query: GET_VALUE, data: { value: 'second-client-update' } });
			await settle();
			expect(mounted.find('#query-source-current').textContent).toBe(
				JSON.stringify({ value: 'second-client-update' }),
			);
			expect(mounted.find('#query-source-previous').textContent).toBe(
				JSON.stringify({ value: 'second-client' }),
			);
		} finally {
			mounted.unmount();
			firstWatchQuery.mockRestore();
			secondWatchQuery.mockRestore();
			first.client.stop();
			second.client.stop();
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
