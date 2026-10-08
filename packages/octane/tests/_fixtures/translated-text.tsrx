import { useState } from 'octane';

declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'x-message': IntrinsicElements['span'];
			}
		}
	}
}

// A page translator rewrites the text a host owns; each click moves every host
// to the next message so the following render must replace that text.
const MESSAGES = ['Hello', 'Goodbye', '', 'Welcome back'];
const IDS = [1, 2];

export function TextBinding() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<span id="text">{MESSAGES[n] as string}</span>
	</div>
}

// The class binding already keeps the span, so the text binding keeps its Text.
export function ClassedTextBinding() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<span id="text" class={n % 2 === 0 ? 'even' : 'odd'}>
			{MESSAGES[n] as string}
		</span>
	</div>
}

// A custom element may own children of its own, so its Text is appended, not seeded.
export function CustomElementText() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<x-message id="text">{MESSAGES[n] as string}</x-message>
	</div>
}

export function RenderableHole() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<span id="hole">{MESSAGES[n]}</span>
	</div>
}

export function KeyedRows() @{
	const [n, setN] = useState(0);
	const rows = IDS.map((id) => ({ id, label: MESSAGES[n] + id }));
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					<b>{row.label as string}</b>
					<i>{row.label}</i>
				</li>
			}
		</ul>
	</div>
}

export function KeyedRowsReadingState() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<ul>
			@for (const id of IDS; key id) {
				<li>
					<b>{(MESSAGES[n] + id) as string}</b>
					<i>{MESSAGES[n] + id}</i>
				</li>
			}
		</ul>
	</div>
}

export function TextToElement() @{
	const [n, setN] = useState(0);
	const content = n === 1 ? <em>{'replaced'}</em> : MESSAGES[n];
	<div>
		<button onClick={() => setN(n + 1)}>{'next'}</button>
		<span id="hole">{content}</span>
	</div>
}
