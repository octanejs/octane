import { useState, useReducer, useRef } from 'octane';

// Fixtures for conformance/hooks-arity.test.ts.

// Per React-hooks-arity.js:23/:34 — the setter returned by useState and the
// dispatch returned by useReducer both take exactly one argument.
export function ArityObserver(props) @{
	const [, setState] = useState(() => 'Halo!');
	const [, dispatch] = useReducer((s) => s, 'Halo!');
	props.observe(setState.length, dispatch.length);
	<span id="ok">{'ok'}</span>
}

// Per useRef-test.internal.js:107 — the SAME ref object is returned on every
// re-render, including across render-phase state updates and a fresh top-level
// update. The first-seen ref is pinned in state; any identity change throws.
export function StableRefAcrossRenderPhase(props) @{
	const ref = useRef('val');
	const [count, setCount] = useState(0);
	const [firstRef] = useState(ref);

	if (firstRef !== ref) {
		throw new Error('should never change');
	}

	if (count < 3) {
		setCount(count + 1);
	}

	<span id="count">
		{count as number}
	</span>
}

// Per ReactDOMHooks-test.js:157 — a state update scheduled from within an
// event handler must not be (eagerly) bailed out: the label re-renders with
// the input's text. (Named inputText/setInputText rather than React's
// text/setText: a user binding called `setText` currently shadows the
// compiler-emitted runtime helper of the same name — real bug, tracked
// separately — and this test targets the event-update heuristic, not that.)
export function InputEventUpdate(props) @{
	const [inputText, setInputText] = useState('');
	<div>
		<input id="in" onInput={(e) => setInputText(e.target.value)} />
		<label id="label">
			{inputText as string}
		</label>
	</div>
}
