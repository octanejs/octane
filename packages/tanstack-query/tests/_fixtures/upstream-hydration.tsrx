import { renderToString } from 'octane/server';
import { environmentManager } from '@tanstack/query-core';
import { QueryClientProvider, useQuery } from '@octanejs/tanstack-query';
import type { QueryClient, UseQueryOptions, UseQueryResult } from '@octanejs/tanstack-query';

// Adapted from the pinned ssr-hydration suite. Both renderers compile the same
// component tree; only the server entry chooses the server runtime.
type HydrationProps = {
	client: QueryClient;
	componentName: string;
	options: UseQueryOptions<string>;
};

function PrintStateComponent({
	componentName,
	result,
}: {
	componentName: string;
	result: UseQueryResult<string>;
}) {
	return `${componentName} - status:${result.status} fetching:${result.isFetching} data:${result.data}`;
}

function QueryPage({ componentName, options }: HydrationProps) @{
	const result = useQuery(options);
	<PrintStateComponent componentName={componentName} result={result} />
}

export function HydrationApp(props: HydrationProps) @{
	<QueryClientProvider client={props.client}>
		<QueryPage {...props} />
	</QueryClientProvider>
}

export function renderHydrationState(props: HydrationProps) {
	const isServer = environmentManager.isServer();
	environmentManager.setIsServer(() => true);
	try {
		return renderToString(HydrationApp, props).html;
	} finally {
		environmentManager.setIsServer(() => isServer);
	}
}
