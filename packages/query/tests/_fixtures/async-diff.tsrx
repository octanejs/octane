import { useState } from 'octane';
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@octanejs/query';

// Async differential fixtures — each side (octane / react) resolves its OWN
// timers independently, so the rig compares: mount (pending on both) → settle
// (success on both), byte-for-byte. A fresh client per MOUNT (useState
// initializer) keeps repeated tests in one file independent.

function delayed<T>(value: T, ms: number): Promise<T> {
	return new Promise((res) => setTimeout(() => res(value), ms));
}

function AsyncReader() @{
	const q = useQuery({
		queryKey: ['a'],
		queryFn: () => delayed('fetched', 10),
		retry: false,
	});
	<div id="d">
		{'data=' + q.data + ' status=' + q.status + ' pending=' + q.isPending + ' fetching=' +
			q.isFetching +
			' success=' +
			q.isSuccess as string}
	</div>
}

export function AsyncApp() @{
	const [client] = useState(
		() => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
	);
	<QueryClientProvider client={client}>
		<AsyncReader />
	</QueryClientProvider>
}

// Mutation lifecycle: click → pending → success, with the full result shape
// (status/data/variables) rendered for the byte-compare.
function MutationReader() @{
	const m = useMutation({
		mutationFn: (v: string) => delayed('done:' + v, 10),
	});
	<div>
		<button id="go" onClick={() => m.mutate('x')}>go</button>
		<div id="m">
			{'status=' + m.status + ' data=' + m.data + ' vars=' + m.variables as string}
		</div>
	</div>
}

export function MutationApp() @{
	const [client] = useState(() => new QueryClient());
	<QueryClientProvider client={client}>
		<MutationReader />
	</QueryClientProvider>
}
