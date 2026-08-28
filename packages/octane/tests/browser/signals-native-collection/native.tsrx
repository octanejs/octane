import { useMemo } from 'octane';
import type { SignalHandle, WritableSignal } from 'octane/signals';

interface ReadProps {
	count$: SignalHandle<number>;
}

function MemoRead(props: ReadProps) @{
	const inferred = useMemo(() => props.count$.get() * 2);
	const fixed = useMemo(() => props.count$.get(), []);
	<section>
		<output id="memo">{String(inferred)}</output>
		<output id="fixed">{String(fixed)}</output>
	</section>
}

function DefaultRead({ count$, value = count$.get() }: ReadProps & { value?: number }) @{
	<output id="defaults">{value + ':' + count$.get()}</output>
}

function IndirectRead(props: ReadProps) {
	const value = props.count$.get();
	const output = <output id="indirect">{String(value)}</output>;
	return output;
}

export interface NativeProps {
	count$: WritableSignal<number>;
	label: string;
	visible: boolean;
}

export function NativeCounter(props: NativeProps) @{
	<main>
		<h1 id="label">{props.label}</h1>
		<input id="draft" aria-label="Draft" defaultValue="initial" />
		<button type="button" onClick={() => props.count$.set((value) => value + 1)}>Increment</button>
		@if (props.visible) {
			<section id="readers">
				<MemoRead count$={props.count$} />
				<DefaultRead count$={props.count$} />
				<IndirectRead count$={props.count$} />
			</section>
		} @else {
			<p id="retired">{'Readers removed'}</p>
		}
	</main>
}
