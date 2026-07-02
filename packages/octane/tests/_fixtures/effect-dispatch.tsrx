import { useEffect, useRef, useState } from 'octane';

// Regression rig for re-entrant drainPhase: effect A synchronously dispatches a
// DISCRETE event (click) whose delegated handler setStates (flushing mid-drain).
// Effect B (queued after A) must still run exactly ONCE — a live-queue walk would
// let the nested flush re-run entries and then the outer walk repeat them.
export function EffectDispatch(props) @{
	const [count, setCount] = useState(0);
	const btnRef = useRef(null);
	const dispatchedRef = useRef(false);
	useEffect(() => {
		props.log.push('A');
		if (!dispatchedRef.current && btnRef.current) {
			dispatchedRef.current = true;
			btnRef.current.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		}
	}, [props.log]);
	useEffect(() => {
		props.log.push('B');
	}, [props.log]);
	<div>
		<button id="target" ref={btnRef} onClick={() => setCount((c) => c + 1)}>{'go'}</button>
		<span id="count">{count}</span>
	</div>
}

// htmlFor → for alias (React parity, like class/className).
export function LabelFor() @{
	<div>
		<label id="lbl" htmlFor="field">{'Name'}</label>
		<input id="field" />
	</div>
}

// `invalid` doesn't bubble; delegated onInvalid must still fire on the control AND
// walk to ancestors (React's onInvalid propagation — a Form observes its controls).
export function InvalidEvents(props) @{
	<form id="f" onInvalid={() => props.log.push('form')}>
		<input id="inp" required onInvalid={() => props.log.push('input')} />
	</form>
}
