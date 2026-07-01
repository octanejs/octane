import { describe, expect, it } from 'vitest';
import * as query from '@octanejs/query';

const expectedReactQueryBindingExports = [
	'queryOptions',
	'infiniteQueryOptions',
	'mutationOptions',
	'useSuspenseQueries',
];

describe('@octanejs/query export surface', () => {
	it('includes the React Query helper exports not provided by query-core', () => {
		for (const key of expectedReactQueryBindingExports) {
			expect(query).toHaveProperty(key);
			expect(typeof (query as any)[key]).toBe('function');
		}
	});

	it('option helper exports are identity helpers like @tanstack/react-query', () => {
		const q = { queryKey: ['x'], queryFn: async () => 'x' };
		const inf = { queryKey: ['i'], queryFn: async () => ['i'], initialPageParam: 0 };
		const mut = { mutationFn: async (value: string) => value };
		expect(query.queryOptions(q)).toBe(q);
		expect(query.infiniteQueryOptions(inf)).toBe(inf);
		expect(query.mutationOptions(mut)).toBe(mut);
	});
});
