import { useState } from 'octane';

// A host spread can carry signal-backed props, so it routes this module's
// renderable holes through the signal-capable child binding, which keeps the
// last primitive as its token instead of the Text node. Keep these components
// out of translated-text.tsrx so that module keeps the ordinary text paths.
const MESSAGES = ['Hello', 'Goodbye', '', 'Welcome back'];

export function SpreadHost() @{
	const [n, setN] = useState(0);
	const attrs = { id: 'hole', title: 'spread' };
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<span {...attrs}>{MESSAGES[n]}</span>
	</div>
}

export function SpreadTextToElement() @{
	const [n, setN] = useState(0);
	const attrs = { id: 'hole', title: 'spread' };
	const content = n === 1 ? <em>{'replaced'}</em> : MESSAGES[n];
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<span {...attrs}>{content}</span>
	</div>
}
