import { useState } from 'octane';
import { query$, type QueryContext, type SignalHandle } from 'octane/signals';

export interface PendingStreamProps {
	load: (selection: string, context: QueryContext) => AsyncIterable<string>;
}

function PendingStreamValue({ value$ }: { value$: SignalHandle<string> }) @{
	const value = value$.get();
	<p class="stream-value">{value as string}</p>
}

function PendingStreamPanel({ selection, load }: PendingStreamProps & { selection: string }) @{
	const value$ = query$(() => selection, load, { key: 'pending-owner-stream', kind: 'stream' });
	<section>
		@try {
			<PendingStreamValue value$={value$} />
		} @pending {
			<p class="stream-pending">{'Waiting for stream'}</p>
		} @catch (error) {
			<p class="stream-error">{(error as Error).message}</p>
		}
	</section>
}

export function PendingStreamParent(props: PendingStreamProps) @{
	const [renderCount, setRenderCount] = useState(0);
	const [selection, setSelection] = useState('original');
	const [show, setShow] = useState(true);
	<main>
		<button
			class="same-inputs"
			onClick={() => setRenderCount(renderCount + 1)}
		>{'Same inputs'}</button>
		<button
			class="change-selection"
			onClick={() => setSelection('replacement')}
		>{'Change selection'}</button>
		<button class="remove-stream" onClick={() => setShow(false)}>{'Remove stream'}</button>
		<p class="parent-render">{String(renderCount)}</p>
		@if (show) {
			<PendingStreamPanel selection={selection} load={props.load} />
		}
	</main>
}
