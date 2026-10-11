import { signal$ } from 'octane/signals';

export interface NativeViewProps {
	initial: string;
	label: string;
}

export function NativeView(props: NativeViewProps) @{
	const value$ = signal$(props.initial);
	<section data-signal-row={props.label}>
		<output>{value$.get()}</output>
		<input aria-label="draft" defaultValue="seed" />
		<button onClick={() => value$.set((value) => value + '!')}>update</button>
	</section>
}
