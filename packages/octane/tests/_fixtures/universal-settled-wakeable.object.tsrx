import { Activity, use, useLayoutEffect, useState } from 'octane';

// Readers that keep suspending on a wakeable whose settlement has already been
// observed. Each retry re-suspends until external state changes on a later task.

function SettledReader(props) @{
	if (!props.gate.check()) use(props.gate.wakeable);
	<resolved label={props.gate.label} />
}

export function SettledBoundary(props) @{
	<scene>
		@try {
			<SettledReader gate={props.gate} />
		} @pending {
			<fallback />
		}
	</scene>
}

export function SettledRoot(props) @{
	<scene>
		<SettledReader gate={props.gate} />
	</scene>
}

export function SettledHiddenActivity(props) @{
	<scene>
		<Activity mode={props.mode}>
			<SettledReader gate={props.gate} />
		</Activity>
	</scene>
}

export function SettledTransition(props) @{
	const [gate, setGate] = useState(props.gate);
	useLayoutEffect(() => props.expose(setGate), []);
	<scene>
		@try {
			<SettledReader gate={gate} />
		} @pending {
			<fallback />
		}
	</scene>
}
