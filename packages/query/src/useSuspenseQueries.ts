import { skipToken } from '@tanstack/query-core';
import { defaultThrowOnError } from './internal';
import { useQueries } from './useQueries';

export function useSuspenseQueries(options: any, ...rest: any[]): any {
	return useQueries(
		{
			...options,
			queries: options.queries.map((query: any) => {
				if (process.env.NODE_ENV !== 'production' && query.queryFn === skipToken) {
					console.error('skipToken is not allowed for useSuspenseQueries');
				}
				return {
					...query,
					suspense: true,
					throwOnError: defaultThrowOnError,
					enabled: true,
					placeholderData: undefined,
				};
			}),
		},
		...rest,
	);
}
