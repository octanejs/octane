import { use } from 'octane';

// Form controls whose server and client values can differ. React 19.2.7
// hydrates each one by writing the client value's reset baseline (the `value`
// attribute, the textarea's content, the `checked` attribute); the live value
// follows it only while the user has not edited the control.

export function Controls({ side, on }: { side: string; on: boolean }) @{
	<main>
		<input id="input" value={side} readOnly={true} />
		<textarea id="textarea" value={side} readOnly={true} />
		<input id="checkbox" type="checkbox" checked={on} readOnly={true} />
		<input id="default-checkbox" type="checkbox" defaultChecked={on} />
	</main>
}

function Ready({ ready }: { ready: PromiseLike<string> }) @{
	<p id="ready">{use(ready) as string}</p>
}

// A read after the controls that can suspend the hydration attempt.
export function SuspendingControls({
	side,
	on,
	ready,
}: {
	side: string;
	on: boolean;
	ready: PromiseLike<string>;
}) @{
	<main>
		<input id="input" value={side} readOnly={true} />
		<textarea id="textarea" value={side} readOnly={true} />
		<input id="checkbox" type="checkbox" checked={on} readOnly={true} />
		<input id="default-checkbox" type="checkbox" defaultChecked={on} />
		<Ready ready={ready} />
	</main>
}
