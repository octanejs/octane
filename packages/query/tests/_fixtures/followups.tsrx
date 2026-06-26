import { Suspense } from 'octane';
import {
	QueryClientProvider,
	HydrationBoundary,
	useInfiniteQuery,
	useSuspenseQuery,
	useQueries,
	useIsFetching,
	useIsMutating,
	usePrefetchQuery,
	useMutation,
	useQuery,
} from '@octanejs/query';

export function Infinite(props: { client: unknown }) @{
	const q = useInfiniteQuery(
		{
			queryKey: ['inf'],
			queryFn: (ctx: { pageParam: number }) => Promise.resolve('p' + ctx.pageParam),
			initialPageParam: 0,
			getNextPageParam: () => undefined,
			retry: false,
		},
		props.client,
	);
	<div id="status">
		{(q.isPending ? 'pending' : 'pages:' + q.data.pages.join(',')) as string}
	</div>
}

export function Queries(props: { client: unknown }) @{
	const results = useQueries(
		{
			queries: [
				{ queryKey: ['qa'], queryFn: () => Promise.resolve('A'), retry: false },
				{ queryKey: ['qb'], queryFn: () => Promise.resolve('B'), retry: false },
			],
		},
		props.client,
	);
	<div id="status">
		{results.map((r: any) => (r.isPending ? '?' : r.data)).join(',') as string}
	</div>
}

export function Fetching(props: { client: unknown; queryFn: () => Promise<string> }) @{
	const reader = useQuery({ queryKey: ['fz'], queryFn: props.queryFn, retry: false }, props.client);
	const fetching = useIsFetching(undefined, props.client);
	<div id="status">
		{'fetching:' + fetching + ' status:' + reader.status as string}
	</div>
}

export function Mutating(props: { client: unknown; mutationFn: (v: string) => Promise<string> }) @{
	const m = useMutation({ mutationKey: ['mz'], mutationFn: props.mutationFn }, props.client);
	const pending = useIsMutating(undefined, props.client);
	<div>
		<span id="status">
			{'pending:' + pending as string}
		</span>
		<button id="go" onClick={() => m.mutate('x')}>go</button>
	</div>
}

export function Prefetch(props: { client: unknown }) @{
	usePrefetchQuery(
		{ queryKey: ['pf'], queryFn: () => Promise.resolve('PF'), retry: false },
		props.client,
	);
	<span id="ok">ok</span>
}

function SuspenseReader(props: { queryFn: () => Promise<string> }) @{
	const q = useSuspenseQuery({ queryKey: ['susq'], queryFn: props.queryFn, retry: false });
	<span id="data">
		{'data:' + q.data as string}
	</span>
}

export function SuspenseQApp(props: { client: unknown; queryFn: () => Promise<string> }) @{
	<QueryClientProvider client={props.client}>
		<Suspense fallback={<span id="fallback">loading</span>}>
			<SuspenseReader queryFn={props.queryFn} />
		</Suspense>
	</QueryClientProvider>
}

function HydratedReader() @{
	const q = useQuery({
		queryKey: ['h'],
		queryFn: () => Promise.resolve('refetched'),
		staleTime: Infinity,
	});
	<span id="hdata">
		{'data:' + q.data as string}
	</span>
}

export function HydrationApp(props: { client: unknown; state: unknown }) @{
	<QueryClientProvider client={props.client}>
		<HydrationBoundary state={props.state}>
			<HydratedReader />
		</HydrationBoundary>
	</QueryClientProvider>
}
