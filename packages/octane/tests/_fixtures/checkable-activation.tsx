import { flushSync, useState } from 'octane';

// A controlled checkbox whose click handler forces a synchronous commit while the
// platform's activation is still in flight (checked toggled, input/change not yet
// dispatched) — the press-state shape interaction libraries use. The commit must not
// reassert the stale controlled prop over the user's toggle; the follow-up native
// `input` event carries the new checkedness to the handler.
export function ActivationCommitCheckbox() {
	const [checked, setChecked] = useState(false);
	const [pressed, setPressed] = useState(false);
	return (
		<input
			type="checkbox"
			checked={checked}
			data-pressed={String(pressed)}
			onClick={() => {
				flushSync(() => setPressed(true));
			}}
			onInput={(e: any) => setChecked(e.target.checked)}
		/>
	);
}

// A controlled radio GROUP with the same mid-activation commit: checking one radio
// unchecks its cousin in the DOM before the click dispatch. The commit must not
// reassert the COUSIN's stale checked either — re-checking it would make the
// browser uncheck the clicked radio again before its input/change fire.
export function ActivationCommitRadioGroup() {
	const [value, setValue] = useState('a');
	const [pressed, setPressed] = useState(false);
	const [seen, setSeen] = useState('none');
	const radio = (v: string) => (
		<input
			type="radio"
			name="acg"
			data-value={v}
			checked={value === v}
			onClick={() => {
				flushSync(() => setPressed(true));
			}}
			onInput={(e: any) => {
				setSeen(v + ':' + e.target.checked);
				if (e.target.checked) setValue(v);
			}}
		/>
	);
	return (
		<div data-pressed={String(pressed)} data-seen={seen}>
			{radio('a')}
			{radio('b')}
		</div>
	);
}

// The rejection contract stays intact: with no onInput committing the toggle, the
// event-side restore still snaps the DOM back to the controlled prop.
export function ActivationCommitRejectedCheckbox() {
	const [pressed, setPressed] = useState(false);
	return (
		<input
			type="checkbox"
			checked={false}
			data-pressed={String(pressed)}
			onClick={() => {
				flushSync(() => setPressed(true));
			}}
		/>
	);
}
