import { Suspense } from 'octane';
import {
	QueryClientProvider,
	HydrationBoundary,
	useInfiniteQuery,
	useSuspenseQuery,
	useSuspenseQueries,
	useQueries,
	useIsFetching,
	useIsMutating,
	usePrefetchQuery,
	useMutation,
	useQuery,
} from '@octanejs/tanstack-query';

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
	<div id="status">{(q.isPending ? 'pending' : 'pages:' + q.data.pages.join(',')) as string}</div>
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
	<div id="status">{results.map((r: any) => (r.isPending ? '?' : r.data)).join(',') as string}</div>
}

export function Fetching(props: { client: unknown; queryFn: () => Promise<string> }) @{
	const reader = useQuery({ queryKey: ['fz'], queryFn: props.queryFn, retry: false }, props.client);
	const fetching = useIsFetching(undefined, props.client);
	<div id="status">{'fetching:' + fetching + ' status:' + reader.status as string}</div>
}

export function Mutating(props: { client: unknown; mutationFn: (v: string) => Promise<string> }) @{
	const m = useMutation({ mutationKey: ['mz'], mutationFn: props.mutationFn }, props.client);
	const pending = useIsMutating(undefined, props.client);
	<div>
		<span id="status">{'pending:' + pending as string}</span>
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
	<span id="data">{'data:' + q.data as string}</span>
}

interface SequentialReaderProps {
	queryFnA: () => Promise<string>;
	queryFnB: () => Promise<string>;
}

function SequentialSuspenseReader(props: SequentialReaderProps) @{
	const a = useSuspenseQuery({ queryKey: ['susq-a'], queryFn: props.queryFnA, retry: false });
	const b = useSuspenseQuery({ queryKey: ['susq-b'], queryFn: props.queryFnB, retry: false });
	<span id="sequential-data">{a.data + '/' + b.data as string}</span>
}

// Once a suspense group settles, a following suspense query must still suspend
// rather than render its always-defined `data` as undefined.
function GroupedSingularSuspenseReader(props: SequentialReaderProps) @{
	const [a] = useSuspenseQueries({
		queries: [
			{ queryKey: ['susq-a'], queryFn: props.queryFnA, retry: false },
		],
	});
	const b = useSuspenseQuery({ queryKey: ['susq-b'], queryFn: props.queryFnB, retry: false });
	<span id="sequential-data">{a.data + '/' + b.data.toUpperCase() as string}</span>
}

function GroupedGroupedSuspenseReader(props: SequentialReaderProps) @{
	const [a] = useSuspenseQueries({
		queries: [
			{ queryKey: ['susq-a'], queryFn: props.queryFnA, retry: false },
		],
	});
	const [b] = useSuspenseQueries({
		queries: [
			{ queryKey: ['susq-b'], queryFn: props.queryFnB, retry: false },
		],
	});
	<span id="sequential-data">{a.data + '/' + b.data.toUpperCase() as string}</span>
}

const SEQUENTIAL_READERS = {
	'singular-singular': SequentialSuspenseReader,
	'grouped-singular': GroupedSingularSuspenseReader,
	'grouped-grouped': GroupedGroupedSuspenseReader,
};

export type SequentialSuspenseOrder = keyof typeof SEQUENTIAL_READERS;

export function SuspenseQApp(props: { client: unknown; queryFn: () => Promise<string> }) @{
	<QueryClientProvider client={props.client}>
		<Suspense fallback={<span id="fallback">loading</span>}>
			<SuspenseReader queryFn={props.queryFn} />
		</Suspense>
	</QueryClientProvider>
}

export function SequentialSuspenseQApp(props: SequentialReaderProps & {
	client: unknown;
	order?: SequentialSuspenseOrder;
}) @{
	const Reader = SEQUENTIAL_READERS[props.order ?? 'singular-singular'];
	<QueryClientProvider client={props.client}>
		@try {
			<Reader queryFnA={props.queryFnA} queryFnB={props.queryFnB} />
		} @pending {
			<span id="sequential-fallback">loading</span>
		} @catch (error) {
			<span id="sequential-error">{'error:' + (error as Error).message as string}</span>
		}
	</QueryClientProvider>
}

function HydratedReader() @{
	const q = useQuery({
		queryKey: ['h'],
		queryFn: () => Promise.resolve('refetched'),
		staleTime: Infinity,
	});
	<span id="hdata">{'data:' + q.data as string}</span>
}

export function HydrationApp(props: { client: unknown; state: unknown }) @{
	<QueryClientProvider client={props.client}>
		<HydrationBoundary state={props.state}>
			<HydratedReader />
		</HydrationBoundary>
	</QueryClientProvider>
}
