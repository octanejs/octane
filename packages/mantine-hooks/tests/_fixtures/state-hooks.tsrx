import { useCounter, useDisclosure, useFetch, useListState } from '@octanejs/mantine-hooks';

export function StateHooks() @{
	const [count, counter] = useCounter(1, { min: 0, max: 2 });
	const [opened, disclosure] = useDisclosure(false, undefined);
	const [items, itemsHandlers] = useListState(['Ada']);

	<section>
		<output id="count">{count as string}</output>
		<button id="increment" onClick={counter.increment}>increment</button>
		<button id="open" onClick={disclosure.open}>open</button>
		<output id="opened">
			{opened ? 'open' : 'closed'}
		</output>
		<button id="append" onClick={() => itemsHandlers.append('Grace')}>append</button>
		<output id="items">{items.join(',')}</output>
	</section>
}

export function CounterWithOmittedOptions() @{
	const [count, counter] = useCounter(1);
	const [defaultCount] = useCounter();
	<div>
		<button id="optional-counter" onClick={counter.increment}>{count as string}</button>
		<output id="default-counter">{defaultCount as string}</output>
	</div>
}

export function FetchHooks() @{
	const { data, loading, refetch } = useFetch<{ value: string }>('/state', { autoInvoke: false });

	<section>
		<button id="fetch" onClick={() => void refetch()}>fetch</button>
		<output id="loading">
			{loading ? 'loading' : 'idle'}
		</output>
		<output id="data">{data?.value ?? 'none'}</output>
	</section>
}
