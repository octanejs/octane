import {
	derived$,
	type DerivedCompute,
	type SignalHandle,
	type WritableSignal,
} from 'octane/signals';

type ReadMode = 'snapshot' | 'latest' | 'get';

export function Presentation(props: {
	selected$: WritableSignal<string>;
	value$: SignalHandle<string>;
	read: ReadMode;
}) @{
	const value =
		props.read === 'snapshot'
			? props.value$.snapshot().status
			: props.read === 'latest'
				? props.value$.latest('none')
				: props.value$.get();
	<main>
		<b>{props.selected$.get() as string}</b>
		<output>{value as string}</output>
	</main>
}

export function DerivedPresentation(props: {
	selected$: WritableSignal<string>;
	compute$: DerivedCompute<string>;
	read: ReadMode;
}) @{
	const value$ = derived$(props.compute$);
	<Presentation selected$={props.selected$} value$={value$} read={props.read} />
}
