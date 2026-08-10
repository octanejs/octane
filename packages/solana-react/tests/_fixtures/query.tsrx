import { QueryClientProvider } from '@octanejs/tanstack-query';
import type { Query } from '@tanstack/query-core';
import { useRequestQuery } from '../../src/query';
import type { RequestSource } from '../../src/query';

type Enabled = boolean | ((query: Query) => boolean);

export function RequestReader(props: {
	source: RequestSource<string> | null;
	enabled?: Enabled;
	onEnabledQuery?: (query: Query) => void;
	onQueryResult?: (query: ReturnType<typeof useRequestQuery>) => void;
	onRefetch?: (refetch: () => Promise<unknown>) => void;
}) @{
	const enabled =
		typeof props.enabled === 'function'
			? (query: Query) => {
					props.onEnabledQuery?.(query);
					return props.enabled!(query);
				}
			: props.enabled;
	const query = useRequestQuery(['request'], props.source, { enabled, retry: false });
	props.onQueryResult?.(query);
	props.onRefetch?.(query.refetch);
	<>
		<span id="status">{(query.isPending ? 'pending' : `data:${query.data}`) as string}</span>
		<button type="button" id="refetch" onClick={() => void query.refetch()}>Refetch</button>
	</>
}

export function RequestApp(props: {
	client: unknown;
	source: RequestSource<string> | null;
	enabled?: Enabled;
	onEnabledQuery?: (query: Query) => void;
	onQueryResult?: (query: ReturnType<typeof useRequestQuery>) => void;
	onRefetch?: (refetch: () => Promise<unknown>) => void;
}) @{
	<QueryClientProvider client={props.client}>
		<RequestReader
			source={props.source}
			enabled={props.enabled}
			onEnabledQuery={props.onEnabledQuery}
			onQueryResult={props.onQueryResult}
			onRefetch={props.onRefetch}
		/>
	</QueryClientProvider>
}

export function OmittedOptionsReader(props: {
	firstSource: RequestSource<string>;
	secondSource: RequestSource<string>;
}) @{
	const first = useRequestQuery(['first'], props.firstSource);
	const second = useRequestQuery(['second'], props.secondSource);
	<>
		<span id="first-status">{(first.isPending ? 'pending' : `data:${first.data}`) as string}</span>
		<span id="second-status">{(second.isPending
			? 'pending'
			: `data:${second.data}`) as string}</span>
	</>
}

export function OmittedOptionsApp(props: {
	client: unknown;
	firstSource: RequestSource<string>;
	secondSource: RequestSource<string>;
}) @{
	<QueryClientProvider client={props.client}>
		<OmittedOptionsReader firstSource={props.firstSource} secondSource={props.secondSource} />
	</QueryClientProvider>
}
