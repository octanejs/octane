// Differential fixtures — controlled form components, run through BOTH
// octane and @tsrx/react (see tests/differential/controlled-forms.test.ts).
// `onInput` fires per keystroke in both runtimes (React's synthetic onInput
// and octane's native delegated input event), so the same source drives both.
import { useState } from 'octane';

// Accepting controlled input — typed values commit and the value ATTRIBUTE
// tracks the prop in both runtimes (React's attribute-syncing cascade).
export function TypedInput() @{
	const [v, setV] = useState('start');
	<input id="ti" value={v} onInput={(e) => setV(e.target.value)} />
}

// Rejecting controlled input — the handler ignores the edit; both runtimes
// snap the DOM back to the rendered value before the browser regains control.
export function LockedInput() @{
	const [v] = useState('locked');
	<input id="li" value={v} onInput={() => {}} />
}

// Filtering controlled input — digits only.
export function FilterInput() @{
	const [v, setV] = useState('');
	<input id="fi" value={v} onInput={(e) => setV(e.target.value.replace(/\D+/g, ''))} />
}

// Controlled checkbox toggled through onClick (identical timing both sides).
export function ToggleBox() @{
	const [on, setOn] = useState(false);
	<input id="tb" type="checkbox" checked={on} onClick={(e) => setOn(e.target.checked)} />
}

// Controlled radio group — inside a <form> so the group is FORM-scoped: the
// rig mounts the octane and React copies into the same document, and
// document-scoped same-name radios would uncheck each other across runtimes.
export function Radios() @{
	const [pick, setPick] = useState('a');
	<form>
		<input
			id="pa"
			type="radio"
			name="dg"
			value="a"
			checked={pick === 'a'}
			onClick={() => setPick('a')}
		/>
		<input
			id="pb"
			type="radio"
			name="dg"
			value="b"
			checked={pick === 'b'}
			onClick={() => setPick('b')}
		/>
	</form>
}

// Controlled select — native `change` drives onChange in both runtimes.
export function SelectPick() @{
	const [v, setV] = useState('two');
	<select id="sp" value={v} onChange={(e) => setV(e.target.value)}>
		<option value="one">one</option>
		<option value="two">two</option>
		<option value="three">three</option>
	</select>
}

// Controlled textarea.
export function Area() @{
	const [v, setV] = useState('hello');
	<textarea id="ar" value={v} onInput={(e) => setV(e.target.value)} />
}

// Uncontrolled with defaults — typing sticks in both runtimes.
export function Defaulted() @{
	<input id="df" defaultValue="seed" />
}
