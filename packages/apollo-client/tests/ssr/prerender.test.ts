import {
	ApolloClient,
	ApolloLink,
	InMemoryCache,
	Observable,
	type FetchResult,
} from '@apollo/client';
import { createElement } from 'octane';
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';
import { prerenderStatic } from '@octanejs/apollo-client/react/ssr';

import {
	ApolloServerFixture,
	ApolloStyledFixture,
	ApolloWaterfallFixture,
	GET_SERVER_VALUE,
} from './_fixtures/server.tsx';

function createServerClient(values: Record<string, Record<string, unknown>>) {
	const operations: string[] = [];
	const link = new ApolloLink(
		(operation) =>
			new Observable<FetchResult>((observer) => {
				operations.push(operation.operationName);
				queueMicrotask(() => {
					const data = values[operation.operationName];
					if (data === undefined) {
						observer.error(new Error(`Unexpected operation: ${operation.operationName}`));
						return;
					}
					observer.next({ data });
					observer.complete();
				});
			}),
	);
	return { client: new ApolloClient({ cache: new InMemoryCache(), link }), operations };
}

describe('@octanejs/apollo-client server rendering', () => {
	it('resolves non-suspending queries and preserves the final Octane render result', async () => {
		expect(typeof document).toBe('undefined');
		const { client, operations } = createServerClient({
			GetServerValue: { value: 'server-ready' },
		});

		try {
			const result = await prerenderStatic({
				tree: createElement(ApolloServerFixture, { client }),
				renderFunction: renderToString,
				diagnostics: true,
			});

			expect(result.result).toContain('data:server-ready');
			expect(result.renderFnResult.html).toBe(result.result);
			expect(result.renderFnResult.css).toBe('');
			expect(result.aborted).toBe(false);
			expect(result.diagnostics?.renderCount).toBe(2);
			expect(operations).toEqual(['GetServerValue']);
			expect(client.readQuery({ query: GET_SERVER_VALUE })).toEqual({ value: 'server-ready' });
		} finally {
			client.stop();
		}
	});

	it('completes nested query waterfalls without refetching an earlier pass', async () => {
		const { client, operations } = createServerClient({
			GetServerValue: { value: 'parent-ready' },
			GetNestedValue: { nestedValue: 'child-ready' },
		});

		try {
			const result = await prerenderStatic({
				tree: createElement(ApolloWaterfallFixture, { client }),
				renderFunction: renderToString,
				diagnostics: true,
			});

			expect(result.result).toContain('data:parent-ready');
			expect(result.result).toContain('nested:child-ready');
			expect(result.diagnostics?.renderCount).toBe(3);
			expect(operations).toEqual(['GetServerValue', 'GetNestedValue']);
		} finally {
			client.stop();
		}
	});

	it('leaves ssr-disabled and no-cache queries for the client', async () => {
		for (const options of [{ ssr: false }, { fetchPolicy: 'no-cache' as const }]) {
			const { client, operations } = createServerClient({
				GetServerValue: { value: 'must-not-run' },
			});

			try {
				const result = await prerenderStatic({
					tree: createElement(ApolloServerFixture, { client, ...options }),
					renderFunction: renderToString,
					diagnostics: true,
				});

				expect(result.result).toContain('loading');
				expect(result.diagnostics?.renderCount).toBe(1);
				expect(operations).toEqual([]);
			} finally {
				client.stop();
			}
		}
	});

	it('keeps Apollo caches and observable subscriptions isolated per request', async () => {
		const first = createServerClient({ GetServerValue: { value: 'first-request' } });
		const second = createServerClient({ GetServerValue: { value: 'second-request' } });

		try {
			const [firstResult, secondResult] = await Promise.all([
				prerenderStatic({
					tree: createElement(ApolloServerFixture, { client: first.client }),
					renderFunction: renderToString,
				}),
				prerenderStatic({
					tree: createElement(ApolloServerFixture, { client: second.client }),
					renderFunction: renderToString,
				}),
			]);

			expect(firstResult.result).toContain('data:first-request');
			expect(firstResult.result).not.toContain('second-request');
			expect(secondResult.result).toContain('data:second-request');
			expect(secondResult.result).not.toContain('first-request');
			expect(first.operations).toEqual(['GetServerValue']);
			expect(second.operations).toEqual(['GetServerValue']);
		} finally {
			first.client.stop();
			second.client.stop();
		}
	});

	it('returns scoped CSS from the final renderer pass', async () => {
		const { client } = createServerClient({ GetServerValue: { value: 'styled-ready' } });

		try {
			const result = await prerenderStatic({
				tree: createElement(ApolloStyledFixture, { client }),
				renderFunction: renderToString,
			});

			expect(result.result).toContain('data:styled-ready');
			expect(result.renderFnResult.css).toContain('data-octane=');
			expect(result.renderFnResult.css).toContain('color: red');
		} finally {
			client.stop();
		}
	});

	it('stops a query waterfall at the configured maximum renderer passes', async () => {
		const { client } = createServerClient({
			GetServerValue: { value: 'parent-ready' },
			GetNestedValue: { nestedValue: 'child-ready' },
		});

		try {
			await expect(
				prerenderStatic({
					tree: createElement(ApolloWaterfallFixture, { client }),
					renderFunction: renderToString,
					maxRerenders: 1,
				}),
			).rejects.toThrow();
		} finally {
			client.stop();
		}
	});

	it('can omit buffered markup while retaining the final scoped renderer result', async () => {
		const { client } = createServerClient({ GetServerValue: { value: 'not-copied' } });

		try {
			const result = await prerenderStatic({
				tree: createElement(ApolloServerFixture, { client }),
				renderFunction: renderToString,
				ignoreResults: true,
			});

			expect(result.result).toBe('');
			expect(result.renderFnResult.html).toContain('data:not-copied');
		} finally {
			client.stop();
		}
	});

	it('does not start query work for a signal that has already been aborted', async () => {
		const { client, operations } = createServerClient({
			GetServerValue: { value: 'must-not-run' },
		});
		const controller = new AbortController();
		controller.abort();

		try {
			await expect(
				prerenderStatic({
					tree: createElement(ApolloServerFixture, { client }),
					renderFunction: renderToString,
					signal: controller.signal,
				}),
			).rejects.toThrow();
			expect(operations).toEqual([]);
		} finally {
			client.stop();
		}
	});
});
