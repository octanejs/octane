import { useState } from 'octane';
import {
	QueryClient,
	QueryClientProvider,
	useSuspenseQueries,
	useSuspenseQuery,
} from '@octanejs/tanstack-query';

// Sequential suspense differential fixtures. The first query settles at 10ms;
// the second query only starts after it, then settles 200ms later. Each side
// (Octane / React) runs its own timers, so the rig compares: mount (fallback) →
// first settled while the second is pending (still fallback) → both settled.
// Reading `.toUpperCase()` on the second query's guaranteed data throws into
// @catch if a runtime renders before that data exists.

function delayed<T>(value: T, ms: number): Promise<T> {
	return new Promise((res) => setTimeout(() => res(value), ms));
}

const first = { queryKey: ['first'], queryFn: () => delayed('A', 10), retry: false };
const second = { queryKey: ['second'], queryFn: () => delayed('b', 200), retry: false };

function SingularSingularReader() @{
	const a = useSuspenseQuery(first);
	const b = useSuspenseQuery(second);
	<span id="result">{a.data + '/' + b.data.toUpperCase() as string}</span>
}

function GroupedSingularReader() @{
	const [a] = useSuspenseQueries({ queries: [first] });
	const b = useSuspenseQuery(second);
	<span id="result">{a.data + '/' + b.data.toUpperCase() as string}</span>
}

function GroupedGroupedReader() @{
	const [a] = useSuspenseQueries({ queries: [first] });
	const [b] = useSuspenseQueries({ queries: [second] });
	<span id="result">{a.data + '/' + b.data.toUpperCase() as string}</span>
}

const READERS = {
	'singular-singular': SingularSingularReader,
	'grouped-singular': GroupedSingularReader,
	'grouped-grouped': GroupedGroupedReader,
};

export function SequentialSuspenseApp(props: { order: keyof typeof READERS }) @{
	const [client] = useState(
		() => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
	);
	const Reader = READERS[props.order];
	<QueryClientProvider client={client}>
		@try {
			<Reader />
		} @pending {
			<span id="fallback">loading</span>
		} @catch (error) {
			<span id="error">{String(error)}</span>
		}
	</QueryClientProvider>
}
