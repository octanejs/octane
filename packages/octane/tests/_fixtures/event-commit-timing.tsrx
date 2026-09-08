import { useState } from 'octane';
import type { EventProbeProps } from './event-boundaries.tsrx';

// Commit-timing probe: the click handler schedules a state update, and outside
// native listeners record what the DOM shows when the event reaches them. The
// React counterpart is written directly in the browser harness (main.ts).
export function CommitTiming(props: EventProbeProps) @{
	const [count, setCount] = useState(0);
	<section
		data-name="timing"
		onClick={(event) => {
			setCount(count + 1);
			props.record('inner:bubble', event);
		}}
	>
		<button data-name="target" data-target>{count as number}</button>
	</section>
}

// Controlled text input under a capture-phase handler. The capture handler is
// what makes the root's capture listener run for `input`; a trusted keystroke
// must still reach onInput with the typed value and commit it. The React
// counterpart is written directly in the browser harness (main.ts).
export function ControlledCapture(props: EventProbeProps) @{
	const [value, setValue] = useState('');
	<section data-name="form" onInputCapture={(event) => props.record('form:capture', event)}>
		<input
			data-name="target"
			data-target
			value={value}
			onInput={(event) => {
				setValue((event.currentTarget as HTMLInputElement).value);
				props.record('target:bubble', event);
			}}
		/>
		<output data-output>{value as string}</output>
	</section>
}
