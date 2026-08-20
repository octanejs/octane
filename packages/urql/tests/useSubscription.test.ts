// Per packages/urql/upstream/canonical/src/hooks/useSubscription.test.tsx
import { vi, expect, it, beforeEach, describe } from 'vitest';
import { createElement, type OctaneNode } from 'octane';
import { act, render } from '@octanejs/testing-library';
import { merge, fromValue, never } from 'wonka';
import type { OperationContext } from '@urql/core';

import { useSubscription, type UseSubscriptionState } from '../src/hooks/useSubscription';
import { mockClient } from './_client-mock';

vi.mock('../src/context', function () {
	return {
		useClient: function useClient() {
			return mockClient;
		},
	};
});

const query = 'subscription Example { example }';
const d = { data: 1234, error: 5678 };

let state: UseSubscriptionState<any> | undefined;
let execute: ((_opts?: Partial<OperationContext>) => void) | undefined;

function SubscriptionUser(props: {
	q: string;
	handler?: (_prev: any, _data: any) => any;
	context?: Partial<OperationContext>;
	pause?: boolean;
}): OctaneNode {
	const pair = useSubscription({ query: props.q, context: props.context, pause: props.pause }, props.handler);
	state = pair[0];
	execute = pair[1];
	return createElement('p', null, state.data);
}

beforeEach(function () {
	mockClient.executeSubscription.mockReset();
	mockClient.executeSubscription.mockImplementation(function () {
		return merge([fromValue(d), never]);
	});
	state = undefined;
});

describe('on initial useEffect', function () {
	it('initialises default state', function () {
		render(createElement(SubscriptionUser, { q: query }));
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
		render(createElement(SubscriptionUser, { q: query }));
		expect(mockClient.executeSubscription).toBeCalledTimes(1);
	});
});

it('should support setting context in useSubscription params', function () {
	const context = { url: 'test' };
	act(function () {
		render(createElement(SubscriptionUser, { q: query, context }));
	});
	expect(mockClient.executeSubscription).toBeCalledWith(
		{
			key: expect.any(Number),
			query: expect.any(Object),
			variables: {},
		},
		{
			url: 'test',
		},
	);
});

it('calls handler', function () {
	const handler = vi.fn();
	const view = render(createElement(SubscriptionUser, { q: query, handler }));
	view.rerender(createElement(SubscriptionUser, { q: query, handler }));
	expect(handler).toBeCalledWith(undefined, 1234);
});

describe('execute subscription', function () {
	it('triggers subscription execution', function () {
		render(createElement(SubscriptionUser, { q: query }));
		act(function () {
			if (execute) execute();
		});
		expect(mockClient.executeSubscription).toBeCalledTimes(2);
	});
});

describe('pause', function () {
	const props = { q: query };

	it('skips executing the query if pause is true', function () {
		render(createElement(SubscriptionUser, { ...props, pause: true }));
		expect(mockClient.executeSubscription).not.toBeCalled();
	});

	it('skips executing queries if pause updates to true', function () {
		const view = render(createElement(SubscriptionUser, props));

		view.rerender(createElement(SubscriptionUser, { ...props, pause: true }));
		view.rerender(createElement(SubscriptionUser, { ...props, pause: true }));
		expect(mockClient.executeSubscription).toBeCalledTimes(1);
		expect(state).toMatchObject({ fetching: false });
	});
});
