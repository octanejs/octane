// Per packages/urql/upstream/canonical/src/hooks/useQuery.test.tsx
import { vi, expect, it, beforeEach, describe } from 'vitest';
import { createElement, type OctaneNode } from 'octane';
import { act, render } from '@octanejs/testing-library';
import { pipe, onStart, onEnd, never, map, interval } from 'wonka';
import type { OperationContext } from '@urql/core';

import { useQuery, type UseQueryArgs, type UseQueryState } from '../src/hooks/useQuery';
import { mockClient } from './_client-mock';

vi.mock('../src/context', function () {
	return {
		useClient: function useClient() {
			return mockClient;
		},
	};
});

const props: UseQueryArgs<{ myVar: number }> = {
	query: '{ example }',
	variables: {
		myVar: 1234,
	},
	pause: false,
};

let state: UseQueryState<any> | undefined;
let execute: ((_opts?: Partial<OperationContext>) => void) | undefined;

function QueryUser(userProps: UseQueryArgs<{ myVar: number }>): OctaneNode {
	const pair = useQuery({
		query: userProps.query,
		variables: userProps.variables,
		pause: userProps.pause,
	});
	state = pair[0];
	execute = pair[1];
	return createElement('p', null, state.data);
}

beforeEach(function () {
	vi.useFakeTimers();
	vi.spyOn(globalThis.console, 'error').mockImplementation(function noop() {});
	mockClient.executeQuery.mockReset();
	mockClient.executeQuery.mockImplementation(function () {
		return pipe(
			interval(400),
			map(function toResult(i: number) {
				return { data: i, error: i + 1, extensions: { i: 1 } };
			}),
		);
	});
	state = undefined;
	execute = undefined;
});

describe('on initial useEffect', function () {
	it('initialises default state', function () {
		render(createElement(QueryUser, props));
		expect(state).toEqual({
			data: undefined,
			error: undefined,
			extensions: undefined,
			fetching: true,
			hasNext: false,
			operation: undefined,
			stale: false,
		});
	});

	it('executes subscription', function () {
		render(createElement(QueryUser, props));
		expect(mockClient.executeQuery).toBeCalledTimes(1);
	});

	it('passes query and vars to executeQuery', function () {
		render(createElement(QueryUser, props));

		expect(mockClient.executeQuery).toBeCalledWith(
			{
				key: expect.any(Number),
				query: expect.any(Object),
				variables: props.variables,
			},
			expect.objectContaining({
				requestPolicy: undefined,
			}),
		);
	});
});

describe('on subscription', function () {
	it('sets fetching to true', function () {
		const view = render(createElement(QueryUser, props));
		view.rerender(createElement(QueryUser, props));
		expect(state).toHaveProperty('fetching', true);
	});
});

describe('on subscription update', function () {
	it('forwards data response', function () {
		const view = render(createElement(QueryUser, props));
		view.rerender(createElement(QueryUser, props));

		act(function () {
			vi.advanceTimersByTime(400);
			view.rerender(createElement(QueryUser, props));
		});

		expect(state).toHaveProperty('data', 0);
	});

	it('forwards error response', function () {
		const view = render(createElement(QueryUser, props));
		view.rerender(createElement(QueryUser, props));

		act(function () {
			vi.advanceTimersByTime(400);
			view.rerender(createElement(QueryUser, props));
		});

		expect(state).toHaveProperty('error', 1);
	});

	it('forwards extensions response', function () {
		const view = render(createElement(QueryUser, props));
		view.rerender(createElement(QueryUser, props));

		act(function () {
			vi.advanceTimersByTime(400);
			view.rerender(createElement(QueryUser, props));
		});

		expect(state).toHaveProperty('extensions', { i: 1 });
	});

	it('sets fetching to false', function () {
		const view = render(createElement(QueryUser, props));
		view.rerender(createElement(QueryUser, props));

		act(function () {
			vi.advanceTimersByTime(400);
			view.rerender(createElement(QueryUser, props));
		});

		expect(state).toHaveProperty('fetching', false);
	});
});

describe('on change', function () {
	const q = 'query NewQuery { example }';

	it('new query executes subscription', function () {
		const view = render(createElement(QueryUser, props));
		view.rerender(createElement(QueryUser, { ...props, query: q }));

		act(function () {
			view.rerender(createElement(QueryUser, { ...props, query: q }));
		});

		expect(mockClient.executeQuery).toBeCalledTimes(2);
	});
});

describe('on unmount', function () {
	const start = vi.fn();
	const unsubscribe = vi.fn();

	beforeEach(function () {
		mockClient.executeQuery.mockReturnValue(pipe(never, onStart(start), onEnd(unsubscribe)));
	});

	it('unsubscribe is called', function () {
		const view = render(createElement(QueryUser, props));
		act(function () {
			view.unmount();
		});
		expect(start).toHaveBeenCalled();
		expect(unsubscribe).toHaveBeenCalled();
	});
});

describe('execute query', function () {
	it('triggers query execution', function () {
		render(createElement(QueryUser, props));
		act(function () {
			if (execute) execute();
		});
		expect(mockClient.executeQuery).toBeCalledTimes(2);
	});
});

describe('pause', function () {
	it('skips executing the query if pause is true', function () {
		render(createElement(QueryUser, { ...props, pause: true }));
		expect(mockClient.executeQuery).not.toBeCalled();
	});

	it('skips executing queries if pause updates to true', function () {
		const view = render(createElement(QueryUser, props));
		view.rerender(createElement(QueryUser, { ...props, pause: true }));

		act(function () {
			view.rerender(createElement(QueryUser, { ...props, pause: true }));
		});

		expect(mockClient.executeQuery).toBeCalledTimes(1);
	});

	it('drops an executed source when paused inputs change', function () {
		const initialProps = { ...props, pause: true };
		const view = render(createElement(QueryUser, initialProps));

		act(function executeWhilePaused() {
			execute?.();
		});
		expect(state).toHaveProperty('fetching', true);

		view.rerender(
			createElement(QueryUser, {
				...initialProps,
				variables: { myVar: 5678 },
			}),
		);

		expect(mockClient.executeQuery).toBeCalledTimes(1);
		expect(state).toHaveProperty('fetching', false);
	});
});
