// Per packages/urql/upstream/canonical/src/hooks/useMutation.test.tsx
import { vi, expect, it, beforeEach, describe } from 'vitest';
import { delay, fromValue, pipe } from 'wonka';
import { print } from 'graphql';
import { gql } from '@urql/core';
import { createElement, type OctaneNode } from 'octane';
import { act, render } from '@octanejs/testing-library';

import { useMutation } from '../src/hooks/useMutation';
import { mockClient } from './_client-mock';

vi.mock('../src/context', function () {
	return {
		useClient: function useClient() {
			return mockClient;
		},
	};
});

const props = {
	query: 'mutation Example { example }',
};

let state: any;
let execute: any;

function MutationUser(userProps: { query: any }): OctaneNode {
	const pair = useMutation(userProps.query);
	state = pair[0];
	execute = pair[1];
	return createElement('p', null, state.data);
}

beforeEach(function () {
	vi.useFakeTimers();
	vi.spyOn(globalThis.console, 'error').mockImplementation(function noop() {});
	mockClient.executeMutation.mockReset();
	mockClient.executeMutation.mockImplementation(function () {
		return pipe(fromValue({ data: 1, error: 2, extensions: { i: 1 } }), delay(200));
	});
	state = undefined;
	execute = undefined;
});

describe('on initial useEffect', function () {
	it('initialises default state', function () {
		render(createElement(MutationUser, props));
		expect(state).toEqual({
			data: undefined,
			error: undefined,
			extensions: undefined,
			fetching: false,
			hasNext: false,
			operation: undefined,
			stale: false,
		});
	});

	it('does not execute subscription', function () {
		render(createElement(MutationUser, props));
		expect(mockClient.executeMutation).toBeCalledTimes(0);
	});
});

describe('on execute', function () {
	const vars = { test: 1234 };

	it('sets fetching to true', function () {
		render(createElement(MutationUser, props));
		act(function () {
			execute(vars);
		});
		expect(state).toHaveProperty('fetching', true);
	});

	it('calls executeMutation', function () {
		render(createElement(MutationUser, props));
		act(function () {
			execute(vars);
		});
		expect(mockClient.executeMutation).toBeCalledTimes(1);
	});

	it('calls executeMutation with query', function () {
		render(createElement(MutationUser, props));
		act(function () {
			execute(vars);
		});

		const call = mockClient.executeMutation.mock.calls[0][0];
		expect(print(call.query)).toBe(print(gql(props.query)));
	});

	it('calls executeMutation with variables', function () {
		render(createElement(MutationUser, props));
		act(function () {
			execute(vars);
		});
		expect(mockClient.executeMutation.mock.calls[0][0]).toHaveProperty('variables', vars);
	});

	it('can adjust context in executeMutation', function () {
		render(createElement(MutationUser, props));
		act(function () {
			execute(vars, { url: 'test' });
		});
		expect(mockClient.executeMutation.mock.calls[0][1].url).toBe('test');
	});
});

describe('on subscription update', function () {
	it('forwards data response', function () {
		const view = render(createElement(MutationUser, props));
		execute();
		act(function () {
			vi.advanceTimersByTime(200);
			view.rerender(createElement(MutationUser, props));
		});
		expect(state).toHaveProperty('data', 1);
	});

	it('forwards error response', function () {
		const view = render(createElement(MutationUser, props));
		execute();
		act(function () {
			vi.advanceTimersByTime(200);
			view.rerender(createElement(MutationUser, props));
		});
		expect(state).toHaveProperty('error', 2);
	});

	it('forwards extensions response', function () {
		const view = render(createElement(MutationUser, props));
		execute();
		act(function () {
			vi.advanceTimersByTime(200);
			view.rerender(createElement(MutationUser, props));
		});
		expect(state).toHaveProperty('extensions', { i: 1 });
	});

	it('sets fetching to false', function () {
		const view = render(createElement(MutationUser, props));
		view.rerender(createElement(MutationUser, props));

		execute();
		act(function () {
			vi.advanceTimersByTime(200);
			view.rerender(createElement(MutationUser, props));
		});
		expect(state).toHaveProperty('fetching', false);
	});
});
