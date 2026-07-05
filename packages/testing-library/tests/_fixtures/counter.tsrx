import { useState, useEffect } from 'octane';

// Click → state fixture (the fireEvent + state-update port).
export function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>
		{'Count: ' + count}
	</button>
}

// Counter whose render is observed from a passive effect — RTL's act.js
// fixture shape (effect callback per commit).
export function EffectfulCounter(props) @{
	const [count, setCount] = useState(0);
	useEffect(() => {
		props.callback();
	});
	<button onClick={() => setCount(count + 1)}>
		{'Count: ' + count}
	</button>
}

// Native-event semantics fixtures: octane's onInput/onChange are the NATIVE
// input/change events (no React synthetic-change remap).
export function InputEcho() @{
	const [value, setValue] = useState('');
	<div>
		<input aria-label="name" onInput={(e) => setValue(e.target.value)} />
		<p data-testid="echo">
			{value as string}
		</p>
	</div>
}

export function EventLog(props) @{
	<input
		aria-label="field"
		onInput={() => props.log('input')}
		onChange={() => props.log('change')}
	/>
}

// Non-bubbling native event delivered via octane's capture-phase delegation.
export function HoverTarget(props) @{
	<div data-testid="hover" onMouseEnter={() => props.log('enter')}>
		hover me
	</div>
}
