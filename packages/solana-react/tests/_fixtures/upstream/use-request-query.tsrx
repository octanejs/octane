import { QueryClientProvider } from '@octanejs/tanstack-query';
import { useRequestQuery } from '../../../src/query';
import type { RequestSource, UseRequestQueryOptions } from '../../../src/query';

export function RequestQueryReader(props: {
	queryKey: readonly unknown[];
	source: RequestSource<string> | null;
	options?: UseRequestQueryOptions<string>;
	onResult?: (result: ReturnType<typeof useRequestQuery>) => void;
}) @{
	const result = useRequestQuery(props.queryKey, props.source, {
		retry: false,
		...props.options,
	});
	props.onResult?.(result);
	<>
		<span id="data">{(result.data === undefined ? 'none' : result.data) as string}</span>
		<span id="error">{(result.error == null
			? 'none'
			: String((result.error as Error).message ?? result.error)) as string}</span>
		<span id="fetch-status">{result.fetchStatus as string}</span>
		<button type="button" id="refetch" onClick={() => void result.refetch()}>
			Refetch
		</button>
	</>
}

export function RequestQueryApp(props: {
	client: unknown;
	queryKey: readonly unknown[];
	source: RequestSource<string> | null;
	options?: UseRequestQueryOptions<string>;
	onResult?: (result: ReturnType<typeof useRequestQuery>) => void;
}) @{
	<QueryClientProvider client={props.client}>
		<RequestQueryReader
			queryKey={props.queryKey}
			source={props.source}
			options={props.options}
			onResult={props.onResult}
		/>
	</QueryClientProvider>
}
