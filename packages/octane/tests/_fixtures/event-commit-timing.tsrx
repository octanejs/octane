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
