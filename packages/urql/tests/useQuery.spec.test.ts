// Per packages/urql/upstream/canonical/src/hooks/useQuery.spec.ts
import {
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
	act,
	waitFor,
} from '@octanejs/testing-library';
import { createElement, ErrorBoundary, Suspense, type OctaneNode } from 'octane';
import { delay, fromValue, interval, map, onStart, pipe } from 'wonka';
import type { RequestPolicy } from '@urql/core';
import { vi, expect, it, beforeEach, afterEach, describe, beforeAll } from 'vitest';

import { useQuery } from '../src/hooks/useQuery';
import { mockClient } from './_client-mock';

vi.mock('../src/context', function () {
	return {
		useClient: function useClient() {
			return mockClient;
		},
	};
});

const mockQuery = `
  query todo($id: ID!) {
    todo(id: $id) {
      id
      text
      completed
    }
  }
`;

const mockVariables = {
	id: 1,
};

describe('useQuery', function () {
	beforeAll(function () {
		vi.spyOn(globalThis.console, 'error').mockImplementation(function noop() {});
	});

	beforeEach(function () {
		mockClient.suspense = false;
		delete mockClient._react;
		mockClient.executeQuery.mockReset();
		mockClient.executeQuery.mockImplementation(function () {
			return pipe(
				interval(1000 / 60),
				map(function toResult(i: number) {
					return { data: i, error: i + 1 };
				}),
			);
		});
	});

	afterEach(function () {
		cleanup();
	});

	it('should set fetching to true and run effect on first mount', function () {
		const { result } = renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		const [state] = result.current;
		expect(state).toEqual({
			fetching: true,
			stale: false,
			hasNext: false,
			extensions: undefined,
			error: undefined,
			data: undefined,
		});
	});

	it('should support setting context in useQuery params', function () {
		const context = { url: 'test' };
		renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables, context });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		expect(mockClient.executeQuery).toBeCalledWith(
			{
				key: expect.any(Number),
				query: expect.any(Object),
				variables: mockVariables,
			},
			{
				requestPolicy: undefined,
				url: 'test',
			},
		);
	});

	it('should execute the subscription', async function () {
		renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);
	});

	it('should pass query and variables to executeQuery', async function () {
		renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);
		expect(mockClient.executeQuery).toBeCalledWith(
			{
				key: expect.any(Number),
				query: expect.any(Object),
				variables: mockVariables,
			},
			expect.objectContaining({
				requestPolicy: undefined,
			}),
		);
	});

	it('should return data from executeQuery', async function () {
		const { result } = renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		await new Promise(function (res) {
			setTimeout(res, 30);
		});
		const [state] = result.current;
		expect(state).toEqual({
			fetching: false,
			stale: false,
			extensions: undefined,
			hasNext: false,
			error: 1,
			data: 0,
		});
	});

	it('should update if a new query is received', async function () {
		const { rerender } = renderHook(
			function hook(props: { query: string; variables: { id?: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);

		const newQuery = `
      query places {
        id
        address
      }
    `;

		rerender({ query: newQuery, variables: {} });
		expect(mockClient.executeQuery).toBeCalledTimes(2);
		expect(mockClient.executeQuery).toHaveBeenNthCalledWith(
			2,
			{
				key: expect.any(Number),
				query: expect.any(Object),
				variables: {},
			},
			expect.objectContaining({
				requestPolicy: undefined,
			}),
		);
	});

	it('should update if new variables are received', async function () {
		const { rerender } = renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);

		const newVariables = {
			id: 2,
		};

		rerender({ query: mockQuery, variables: newVariables });
		expect(mockClient.executeQuery).toBeCalledTimes(2);
		expect(mockClient.executeQuery).toHaveBeenNthCalledWith(
			2,
			{
				key: expect.any(Number),
				query: expect.any(Object),
				variables: newVariables,
			},
			expect.objectContaining({
				requestPolicy: undefined,
			}),
		);
	});

	it('should not update if query and variables are unchanged', async function () {
		const { rerender } = renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);

		rerender({ query: mockQuery, variables: mockVariables });
		expect(mockClient.executeQuery).toBeCalledTimes(1);
	});

	it('should update if a new requestPolicy is provided', async function () {
		const { rerender } = renderHook(
			function hook(props: {
				query: string;
				variables: { id: number };
				requestPolicy: RequestPolicy;
			}) {
				return useQuery({
					query: props.query,
					variables: props.variables,
					requestPolicy: props.requestPolicy,
				});
			},
			{
				initialProps: {
					query: mockQuery,
					variables: mockVariables,
					requestPolicy: 'cache-first' as RequestPolicy,
				},
			},
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);
		expect(mockClient.executeQuery).toHaveBeenNthCalledWith(
			1,
			{
				key: expect.any(Number),
				query: expect.any(Object),
				variables: mockVariables,
			},
			expect.objectContaining({
				requestPolicy: 'cache-first',
			}),
		);

		rerender({
			query: mockQuery,
			variables: mockVariables,
			requestPolicy: 'network-only',
		});
		expect(mockClient.executeQuery).toBeCalledTimes(2);
		expect(mockClient.executeQuery).toHaveBeenNthCalledWith(
			2,
			{
				key: expect.any(Number),
				query: expect.any(Object),
				variables: mockVariables,
			},
			expect.objectContaining({
				requestPolicy: 'network-only',
			}),
		);
	});

	it('should provide an executeQuery function to be imperatively executed', async function () {
		const { result } = renderHook(
			function hook(props: { query: string; variables: { id: number } }) {
				return useQuery({ query: props.query, variables: props.variables });
			},
			{ initialProps: { query: mockQuery, variables: mockVariables } },
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);

		const [, executeQuery] = result.current;
		act(function () {
			executeQuery();
		});
		expect(mockClient.executeQuery).toBeCalledTimes(2);
	});

	it('should refetch suspense errors after an error boundary is reset', async function () {
		let requests = 0;
		const queryError = new Error('Query failed');

		// OCTANE DIVERGENCE: Octane has no class components; use built-in ErrorBoundary + Suspense.
		function QueryUser(): OctaneNode {
			const [state] = useQuery({
				query: mockQuery,
				variables: mockVariables,
			});

			if (state.error) {
				throw state.error;
			}

			return createElement('p', null, 'Loaded');
		}

		function fallback(error: unknown, reset: () => void): OctaneNode {
			void error;
			return createElement(
				'button',
				{
					onClick: function retry() {
						reset();
					},
				},
				'Try again',
			);
		}

		mockClient.suspense = true;
		mockClient.executeQuery.mockImplementation(function () {
			return pipe(
				fromValue({ error: queryError }),
				delay(10),
				onStart(function count() {
					requests++;
				}),
			);
		});

		function preventQueryError(event: ErrorEvent) {
			if (event.error === queryError) {
				event.preventDefault();
			}
		}

		window.addEventListener('error', preventQueryError);

		try {
			render(
				createElement(
					ErrorBoundary,
					{ fallback },
					createElement(Suspense, { fallback: createElement('p', null, 'Loading') }, createElement(QueryUser)),
				),
			);

			expect(screen.getByText('Loading')).toBeTruthy();
			const retryButton = await screen.findByRole('button', {
				name: 'Try again',
			});
			const requestsBeforeRetry = requests;
			expect(requestsBeforeRetry).toBeGreaterThan(0);

			fireEvent.click(retryButton);

			expect(screen.getByText('Loading')).toBeTruthy();
			await screen.findByRole('button', { name: 'Try again' });
			await waitFor(function () {
				expect(requests).toBeGreaterThan(requestsBeforeRetry);
			});
		} finally {
			window.removeEventListener('error', preventQueryError);
		}
	});

	it('should pause executing the query if pause is true', function () {
		renderHook(
			function hook(props: { query: string; variables: { id: number }; pause: boolean }) {
				return useQuery({
					query: props.query,
					variables: props.variables,
					pause: props.pause,
				});
			},
			{
				initialProps: {
					query: mockQuery,
					variables: mockVariables,
					pause: true,
				},
			},
		);

		expect(mockClient.executeQuery).not.toBeCalled();
	});

	it('should pause executing the query if pause updates to true', async function () {
		const { rerender } = renderHook(
			function hook(props: { query: string; variables: { id: number }; pause: boolean }) {
				return useQuery({
					query: props.query,
					variables: props.variables,
					pause: props.pause,
				});
			},
			{
				initialProps: {
					query: mockQuery,
					variables: mockVariables,
					pause: false,
				},
			},
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);

		rerender({ query: mockQuery, variables: mockVariables, pause: true });
		expect(mockClient.executeQuery).toBeCalledTimes(1);
	});
});
