import { useState, useTransition } from 'octane';
import { QueryClientProvider, useSuspenseQuery } from '@octanejs/tanstack-query';
import type { QueryClient } from '@octanejs/tanstack-query';

interface ReaderProps {
	queryFn: (value: number) => Promise<string>;
	bindSetValue: (setter: (value: number) => void) => void;
	bindSetValueUrgent?: (setter: (value: number) => void) => void;
}

interface AppProps extends ReaderProps {
	client: QueryClient;
}

// Reader owns the transition; PendingProbe is independent and stays idle.
// Controlled query promises let tests distinguish held transitions from urgent
// key changes without depending on query-core notification timing.

function PendingProbe() @{
	const [isPending] = useTransition();
	<span id="pending">
		{isPending ? 'pending' : 'idle'}
	</span>
}

function Reader(props: ReaderProps) @{
	const [value, setValue] = useState(1);
	const [isPending, start] = useTransition();
	// Expose a transition-priority value setter to the test.
	props.bindSetValue((v) => start(() => setValue(v)));
	// An explicit urgent update can supersede the held transition.
	if (props.bindSetValueUrgent) props.bindSetValueUrgent((v) => setValue(v));
	const q = useSuspenseQuery({
		queryKey: ['transition-suspense', value],
		queryFn: () => props.queryFn(value),
		retry: false,
	});
	<span id="data" data-pending={isPending ? 'pending' : 'idle'}>{'data:' + q.data as string}</span>
}

export function TransitionSuspenseApp(props: AppProps) @{
	<QueryClientProvider client={props.client}>
		<div>
			<PendingProbe />
			@try {
				<Reader
					queryFn={props.queryFn}
					bindSetValue={props.bindSetValue}
					bindSetValueUrgent={props.bindSetValueUrgent}
				/>
			} @pending {
				<span id="fallback">loading</span>
			} @catch (e) {
				<span id="caught">{'caught:' + (e as Error).message as string}</span>
			}
		</div>
	</QueryClientProvider>
}
