import { useCounter, useDebouncedValue, useDisclosure } from '@octanejs/mantine-hooks';
import { useState } from 'octane';

export function MantineHooksDemo() @{
	const [count, counter] = useCounter(2, { min: 0, max: 10 });
	const [opened, disclosure] = useDisclosure(false);
	const [query, setQuery] = useState('');
	const [debouncedQuery] = useDebouncedValue(query, 350);

	<div>
		<h2 class="demo-title">{'Mantine Hooks on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'Interactive state and timing hooks using Octane-native lifecycle primitives.'}</p>
		<div class="panel">
			<div class="row">
				<button class="btn" onClick={counter.decrement}>−</button>
				<strong id="mantine-count">{count as string}</strong>
				<button class="btn" onClick={counter.increment}>+</button>
				<button class="btn" onClick={counter.reset}>Reset</button>
			</div>
		</div>
		<div class="panel">
			<button class="btn" onClick={disclosure.toggle}>
				{opened ? 'Hide details' : 'Show details'}
			</button>
			@if (opened) {
				<p id="mantine-disclosure">{'Disclosure state is open.'}</p>
			}
		</div>
		<div class="panel">
			<label>
				{'Debounced search '}
				<input
					class="txt"
					value={query}
					onInput={(event) => setQuery(event.currentTarget.value)}
					placeholder="Type to debounce"
				/>
			</label>
			<p>{'Immediate: ' + query}</p>
			<p id="mantine-debounced">{'Debounced: ' + debouncedQuery}</p>
		</div>
	</div>
}
