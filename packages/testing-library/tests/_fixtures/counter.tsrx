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
	}, null);
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

// Controlled-input fixtures: a `value` prop is LIVE CONTROLLED (React parity) —
// the runtime reasserts the rendered value on every commit and after each
// discrete-event flush. The handler here ignores the event, so edits snap back.
export function ControlledInputIgnoring() @{
	const [value] = useState('locked');
	<input aria-label="locked" value={value} onInput={() => {}} />
}

// …and the accepting twin: onInput feeds the state, so typing sticks.
export function ControlledInputAccepting() @{
	const [value, setValue] = useState('');
	<div>
		<input aria-label="name" value={value} onInput={(e) => setValue(e.target.value)} />
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

export function NativeTextCommit(props) @{
	<input
		aria-label="draft"
		defaultValue=""
		onChange={(event) => props.log(event.currentTarget.value)}
		suppressNativeChangeWarning
	/>
}

export function CheckableEventLog(props) @{
	<input
		type="checkbox"
		aria-label="enabled"
		onClick={() => props.log('click')}
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
