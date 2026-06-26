import { QueryClient, QueryClientProvider, useQuery } from '@octanejs/query';

// Each side (octane / react) gets its OWN module-level client from its own
// QueryClient class. `initialData` + infinite staleTime means the query is
// `success` synchronously with no fetch — so the differential rig can compare the
// rendered result shape (data + status + flags) byte-for-byte without any async
// orchestration.
const client = new QueryClient();

export function Cached() @{
	const q = useQuery({
		queryKey: ['c'],
		queryFn: () => Promise.resolve('fetched'),
		initialData: 'seed',
		staleTime: Infinity,
	});
	<div id="d">
		{'data=' + q.data + ' status=' + q.status + ' pending=' + q.isPending + ' fetching=' +
			q.isFetching +
			' success=' +
			q.isSuccess as string}
	</div>
}

export function CachedApp() @{
	<QueryClientProvider client={client}>
		<Cached />
	</QueryClientProvider>
}
