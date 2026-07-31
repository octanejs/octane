import { useBoolean, useCounter, useDebounceValue } from '@octanejs/usehooks-ts';
import { useState } from 'octane';

export function UseHooksTsDemo() @{
	const enabled = useBoolean(false);
	const counter = useCounter(3);
	const [query, setQuery] = useState('');
	const [debouncedQuery] = useDebounceValue(query, 350);

	<div>
		<h2 class="demo-title">{'usehooks-ts on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'State helpers and timer lifecycles adapted to compiler-selected Octane hook slots.'}</p>
		<div class="panel row">
			<button class="btn" onClick={enabled.toggle}>
				{enabled.value ? 'Enabled' : 'Disabled'}
			</button>
			<button class="btn" onClick={counter.decrement}>−</button>
			<strong id="usehooks-count">{counter.count as string}</strong>
			<button class="btn" onClick={counter.increment}>+</button>
			<button class="btn" onClick={counter.reset}>Reset</button>
		</div>
		<div class="panel">
			<label>
				{'Debounced value '}
				<input
					class="txt"
					value={query}
					onInput={(event) => setQuery(event.currentTarget.value)}
					placeholder="Type to debounce"
				/>
			</label>
			<p>{'Immediate: ' + query}</p>
			<p id="usehooks-debounced">{'Debounced: ' + debouncedQuery}</p>
		</div>
	</div>
}
