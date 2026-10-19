import { startTransition } from 'octane';
import {
	derived$,
	query$,
	type DerivedCompute,
	type QueryContext,
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

export function RedeclaredResource(props: {
	selected$: WritableSignal<string>;
	selection?: string;
	load: (key: string, context: QueryContext<string>) => string | Promise<string>;
	gate: Promise<void>;
}) @{
	const value$ = query$(() => props.selection ?? props.selected$.get(), props.load);
	const snapshot = value$.snapshot();
	<main>
		<button
			onClick={() =>
				startTransition(() => {
					props.selected$.set('B');
					value$.snapshot();
					return props.gate;
				})
			}
		>
			{'select B'}
		</button>
		<output>{(snapshot.status === 'ready' ? snapshot.value : snapshot.status) as string}</output>
	</main>
}
