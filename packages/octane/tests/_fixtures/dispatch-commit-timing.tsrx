import { useState, flushSync } from 'octane';

// Probes for WHEN a delegated discrete event commits handler-scheduled state,
// as observed by code outside the Octane root (native listeners registered on
// document, and the script that dispatched the event).

export function Counter() @{
	const [n, setN] = useState(0);
	<button id="counter" onClick={() => setN(n + 1)}>{n as number}</button>
}

export function FunctionalCounter() @{
	const [n, setN] = useState(0);
	<button id="fcounter" onClick={() => setN((v) => v + 1)}>{n as number}</button>
}

export function SyncCounter() @{
	const [n, setN] = useState(0);
	<button id="sync" onClick={() => flushSync(() => setN(n + 1))}>{n as number}</button>
}

// A click handler that submits the form programmatically from INSIDE the click
// dispatch. Native `submit` listeners registered by outside code observe the
// DOM while the click's own update is still pending.
export function NestedSubmit() @{
	const [status, setStatus] = useState('idle');
	<form id="nested-form" onSubmit={(e) => e.preventDefault()}>
		<output id="status">{status as string}</output>
		<button
			id="nested-btn"
			type="button"
			onClick={(e) => {
				setStatus('submitting');
				e.currentTarget.form.requestSubmit();
			}}
		>
			go
		</button>
	</form>
}

// Controlled text input: an accepted edit is committed at the dispatch
// boundary (React's batchedUpdates flushes sync work when a controlled restore
// is pending), and an unheard edit snaps back at that same boundary.
export function ControlledInput() @{
	const [value, setValue] = useState('a');
	<div>
		<input id="accepted" value={value} onInput={(e) => setValue(e.currentTarget.value)} />
		<output id="mirror">{value as string}</output>
	</div>
}

export function RejectedInput() @{
	const [value] = useState('fixed');
	<input id="rejected" value={value} />
}

// Controlled input beside a reset button whose click ALSO clears the state. A
// script click queues the update; the button's default action then resets the
// form, so the control follows its value attribute again (non-dirty) until the
// commit writes the property — before syncing the attribute, as React's
// updateInput does — and marks it dirty.
export function ResetForm() @{
	const [value, setValue] = useState('');
	<form id="reset-form" onSubmit={(e) => e.preventDefault()}>
		<input id="reset-input" value={value} onInput={(e) => setValue(e.currentTarget.value)} />
		<button id="reset-btn" type="reset" onClick={() => setValue('')}>
			reset
		</button>
	</form>
}
