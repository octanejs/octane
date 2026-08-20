// Per packages/urql/upstream/canonical/src/components/Mutation.test.tsx
import { vi, expect, it, beforeEach, describe } from 'vitest';
import { createElement, type OctaneNode } from 'octane';
import { act, render } from '@octanejs/testing-library';
import { delay, fromValue, pipe } from 'wonka';

import { Mutation, type MutationState } from '../src/components/Mutation';
import { mockClient } from './_client-mock';

vi.mock('../src/context', function () {
	return {
		useClient: function useClient() {
			return mockClient;
		},
	};
});

const query = 'mutation Example { example }';

describe('Mutation', function () {
	beforeEach(function () {
		vi.useFakeTimers();
		vi.spyOn(globalThis.console, 'error').mockImplementation(function noop() {});
		mockClient.executeMutation.mockReset();
		mockClient.executeMutation.mockImplementation(function () {
			return pipe(fromValue({ data: 1, error: 2 }), delay(200));
		});
	});

	it('Should execute the mutation', function () {
		let execute = function noop() {};
		let props: Record<string, unknown> = {};
		function Test(): OctaneNode {
			return createElement('p', null, 'Hi');
		}
		function App(): OctaneNode {
			return createElement(Mutation, {
				query,
				children: function children(arg: MutationState) {
					execute = arg.executeMutation;
					props = { data: arg.data, fetching: arg.fetching, error: arg.error };
					return createElement(Test);
				},
			});
		}
		render(createElement(App));
		expect(mockClient.executeMutation).toBeCalledTimes(0);
		expect(props).toStrictEqual({
			data: undefined,
			fetching: false,
			error: undefined,
		});
		act(function () {
			execute();
		});
		expect(props).toStrictEqual({
			data: undefined,
			fetching: true,
			error: undefined,
		});
		act(function () {
			vi.advanceTimersByTime(400);
		});
		expect(props).toStrictEqual({ data: 1, fetching: false, error: 2 });
	});
});
