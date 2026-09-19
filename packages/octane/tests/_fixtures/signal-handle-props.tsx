/** @jsxImportSource octane */
import type { SignalHandle } from 'octane/signals';

export function SignalHandleProps(props: { value: SignalHandle<number> }) {
	return (
		<section>
			<input value={props.value} />
			<output data-count={props.value}>{props.value}</output>
		</section>
	);
}

export function SignalHandleForm(props: {
	value: SignalHandle<number>;
	action: (data: FormData) => Promise<void>;
}) {
	return (
		<form action={props.action}>
			<input name="count" value={props.value} />
			<span>{props.value}</span>
			<button type="submit">Save</button>
		</form>
	);
}
