import { useState } from 'octane';
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@octanejs/tanstack-query';

// A fresh client per mount keeps the two renderer caches and repeated tests independent.

function delayed<T>(value: T, ms: number): Promise<T> {
	return new Promise((res) => setTimeout(() => res(value), ms));
}

function AsyncReader({ queryFn }: { queryFn: () => Promise<string> }) @{
	const q = useQuery({
		queryKey: ['a'],
		queryFn,
		retry: false,
	});
	<div id="d">
		{
			('data=' +
				q.data +
				' status=' +
				q.status +
				' pending=' +
				q.isPending +
				' fetching=' +
				q.isFetching +
				' success=' +
				q.isSuccess) as string
		}
	</div>
}

export function AsyncApp({ queryFn }: { queryFn: () => Promise<string> }) @{
	const [client] = useState(
		() => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
	);
	<QueryClientProvider client={client}>
		<AsyncReader queryFn={queryFn} />
	</QueryClientProvider>
}

// Mutation lifecycle: click → pending → success, with the full result shape
// (status/data/variables) rendered for the byte-compare.
function MutationReader() @{
	const m = useMutation({
		mutationFn: (v: string) => delayed('done:' + v, 10),
	});
	<div>
		<button id="go" onClick={() => m.mutate('x')}>
			go
		</button>
		<div id="m">
			{('status=' + m.status + ' data=' + m.data + ' vars=' + m.variables) as string}
		</div>
	</div>
}

export function MutationApp() @{
	const [client] = useState(() => new QueryClient());
	<QueryClientProvider client={client}>
		<MutationReader />
	</QueryClientProvider>
}
