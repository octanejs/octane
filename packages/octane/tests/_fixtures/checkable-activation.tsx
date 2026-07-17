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
