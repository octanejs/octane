import { signal$ } from 'octane/signals';

export function SignalRow(props: { id: string; initial: string }) @{
	const value$ = signal$(props.initial);
	<li data-id={props.id}>
		<input value={value$} />
		<button onClick={() => value$.set(value$.get() + '!')}>{value$.get() as string}</button>
	</li>
}
