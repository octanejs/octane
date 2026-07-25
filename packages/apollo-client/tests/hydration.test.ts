import {
	ApolloClient,
	ApolloLink,
	InMemoryCache,
	Observable,
	type FetchResult,
} from '@apollo/client';
import {
	ApolloProvider as ReactApolloProvider,
	useQuery as useReactQuery,
} from '@apollo/client/react';
import { createElement as createReactElement } from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import { flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../octane/tests/_helpers';
import { ApolloServerFixture, GET_SERVER_VALUE } from './ssr/_fixtures/server.tsx';

function ReactServerValue(props: { client: ApolloClient }) {
	const result = useReactQuery(GET_SERVER_VALUE);
	const value = (result.data as { value?: string } | undefined)?.value;
	return createReactElement(
		'main',
		{ id: 'apollo-server' },
		createReactElement(
			'output',
			{ id: 'apollo-server-value' },
			result.loading ? 'loading' : result.error ? 'error' : 'data:' + (value ?? '-'),
		),
		createReactElement('button', { id: 'apollo-update-cache' }, 'Update cache'),
	);
}

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('@octanejs/apollo-client hydration', () => {
	it('adopts cached server markup without fetching the restored query again', async () => {
		const serverClient = new ApolloClient({
			cache: new InMemoryCache(),
			link: ApolloLink.empty(),
		});
		serverClient.writeQuery({ query: GET_SERVER_VALUE, data: { value: 'restored' } });

		const operations: string[] = [];
		const client = new ApolloClient({
			cache: new InMemoryCache().restore(serverClient.extract()),
			link: new ApolloLink(
				(operation) =>
					new Observable<FetchResult>((observer) => {
						operations.push(operation.operationName);
						observer.next({ data: { value: 'unexpected-network' } });
						observer.complete();
					}),
			),
		});

		const container = document.createElement('div');
		container.innerHTML = renderReactToString(
			createReactElement(ReactApolloProvider, {
				client,
				children: createReactElement(ReactServerValue, { client }),
			}),
		);
		document.body.appendChild(container);
		const serverMain = container.querySelector('#apollo-server');
		const serverValue = container.querySelector('#apollo-server-value');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			expect(serverValue?.textContent).toBe('data:restored');
			expect(operations).toEqual([]);

			root = hydrateRoot(container, ApolloServerFixture, { client });
			await settle();

			expect(container.querySelector('#apollo-server')).toBe(serverMain);
			expect(container.querySelector('#apollo-server-value')).toBe(serverValue);
			expect(serverValue?.textContent).toBe('data:restored');
			expect(operations).toEqual([]);
			expect(errors).not.toHaveBeenCalled();

			container.querySelector<HTMLButtonElement>('#apollo-update-cache')?.click();
			await settle();

			expect(serverValue?.textContent).toBe('data:updated');
			expect(operations).toEqual([]);
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
			client.stop();
			serverClient.stop();
		}
	});
});
