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
