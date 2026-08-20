// Per packages/urql/upstream/canonical/src/hooks/useRequest.test.ts
import { gql } from '@urql/core';
import { renderHook } from '@octanejs/testing-library';
import { expect, it } from 'vitest';
import { useRequest } from '../src/hooks/useRequest';

it('preserves instance of request when key has not changed', function () {
	const query = gql`
		query getUser($name: String) {
			user(name: $name) {
				id
				firstName
				lastName
			}
		}
	`;

	let variables: Record<string, unknown> = {
		name: 'Clara',
	};

	const { result, rerender } = renderHook(
		function hook(props: { query: typeof query; variables: Record<string, unknown> }) {
			return useRequest(props.query, props.variables as any);
		},
		{ initialProps: { query, variables } },
	);

	const resultA = result.current;
	expect(resultA).toEqual({
		key: expect.any(Number),
		query: expect.anything(),
		variables: variables,
	});

	variables = { ...variables };
	rerender({ query, variables });

	const resultB = result.current;
	expect(resultA).toBe(resultB);

	variables = { ...variables, test: true };
	rerender({ query, variables });

	const resultC = result.current;
	expect(resultA).not.toBe(resultC);
});
