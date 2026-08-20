// Per packages/urql/upstream/canonical/src/components/Query.test.tsx
import { vi, expect, it, beforeEach, describe } from 'vitest';
import { createElement, type OctaneNode } from 'octane';
import { render } from '@octanejs/testing-library';
import { map, interval, pipe } from 'wonka';

import { Query } from '../src/components/Query';
import { mockClient } from './_client-mock';

vi.mock('../src/context', function () {
	return {
		useClient: function useClient() {
			return mockClient;
		},
	};
});

const query = '{ example }';
const variables = {
	myVar: 1234,
};

describe('Query', function () {
	beforeEach(function () {
		vi.spyOn(globalThis.console, 'error').mockImplementation(function noop() {});
		mockClient.executeQuery.mockReset();
		mockClient.executeQuery.mockImplementation(function () {
			return pipe(
				interval(150),
				map(function toResult(i: number) {
					return { data: i, error: i + 1 };
				}),
			);
		});
	});

	it('Should execute the query', async function () {
		let props: Record<string, unknown> = {};
		function Test(): OctaneNode {
			return createElement('p', null, 'Hi');
		}
		function App(): OctaneNode {
			return createElement(Query, {
				query,
				variables,
				children: function children(arg: { data: unknown; fetching: boolean; error: unknown }) {
					props = { data: arg.data, fetching: arg.fetching, error: arg.error };
					return createElement(Test);
				},
			});
		}
		render(createElement(App));
		expect(props).toStrictEqual({
			data: undefined,
			fetching: true,
			error: undefined,
		});
		await new Promise(function (res) {
			setTimeout(function () {
				expect(props).toStrictEqual({ data: 0, fetching: false, error: 1 });
				res(null);
			}, 200);
		});
	});
});
