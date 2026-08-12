import { QueryClient, QueryClientProvider, useQuery } from '@octanejs/tanstack-query';

const client = new QueryClient();

function QueryResult() @{
	const query = useQuery({
		queryKey: ['server-user'],
		queryFn: async () => 'unreachable',
		initialData: 'Server Ada',
	});
	<output id="query-result">{query.status}:{query.data}</output>
}

export function ServerQuery() @{
	<QueryClientProvider client={client}>
		<QueryResult />
	</QueryClientProvider>
}
