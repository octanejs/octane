import { useState } from 'octane';

// A sole-child value hole that flips array -> text -> array with plain urgent
// updates. The array mode mints marker comments inside the host; the text mode
// wipes the host; going back must not anchor on the wiped markers.
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
