// Sole-child value holes whose kind flips into and out of the keyed-array
// regime (array <-> text / null / component / pure host). Round-tripping back
// to an array must remount items cleanly every cycle.
//
// Where a flip target is JSX, it is assigned in setup: a statically JSX-armed
// ternary lowers to an @if-style block instead of the value hole under test.

import { useState } from 'octane';

function Chip() @{
	<b>{'chip'}</b>
}

export function HoleKindRoundTrip() @{
	const [mode, setMode] = useState(0);
	const rows =
		mode % 2 === 0 ? ['a', 'b'] : null;
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">
			{rows === null ? 'plain' : rows.map((id) => <i key={id}>{id as string}</i>)}
		</div>
	</div>
}

export function ArrayNullRoundTrip() @{
	const [mode, setMode] = useState(0);
	const rows =
		mode % 2 === 0 ? ['a', 'b'] : null;
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">
			{rows === null ? null : rows.map((id) => <i key={id}>{id as string}</i>)}
		</div>
	</div>
}

export function ArrayComponentRoundTrip() @{
	const [mode, setMode] = useState(0);
	let content;
	if (mode % 2 === 0) {
		content = ['a', 'b'].map((id) => <i key={id}>{id as string}</i>);
	} else {
		content = <Chip />;
	}
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">{content}</div>
	</div>
}

export function ArrayHostRoundTrip() @{
	const [mode, setMode] = useState(0);
	let content;
	if (mode % 2 === 0) {
		content = ['a', 'b'].map((id) => <i key={id}>{id as string}</i>);
	} else {
		content = <em>{'solo'}</em>;
	}
	<div>
		<button id="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div id="host">{content}</div>
	</div>
}
