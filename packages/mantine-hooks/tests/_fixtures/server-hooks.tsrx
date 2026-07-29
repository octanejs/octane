import { useCounter, useDisclosure, useListState, useMediaQuery } from '@octanejs/mantine-hooks';

export function ServerHooks() @{
	// Keep every optional user argument explicit: Octane appends the custom-hook
	// slot after these arguments when it compiles this TSRX call site.
	const [count] = useCounter(2, undefined);
	const [opened] = useDisclosure(true, undefined);
	const [items] = useListState(['Ada', 'Grace']);
	const wide = useMediaQuery('(min-width: 60rem)', false, undefined);

	<output>{`${count}:${opened ? 'open' : 'closed'}:${items.join(',')}:${
		wide ? 'wide' : 'narrow'
	}`}</output>
}

export function ExplicitInitialMediaQuery() @{
	const matches = useMediaQuery('(min-width: 60rem)', true, { getInitialValueInEffect: false });
	<output>
		{matches ? 'wide' : 'narrow'}
	</output>
}
