import { use, useState } from 'octane';
import { query$, type QuerySignal } from 'octane/signals';

interface StreamedQueryProps {
	load: (key: string) => AsyncIterable<string>;
	gate?: Promise<void>;
}

function StreamedQueryView(props: { value$: QuerySignal<string> }) @{
	const [count, setCount] = useState(0);
	<section class="streamed-query-view">
		<output>{props.value$}</output>
		<input defaultValue="server draft" />
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
	</section>
}

export function StreamedRootQuery(props: StreamedQueryProps) @{
	const value$ = query$(() => 'conversation', props.load, { kind: 'stream' });
	<main>
		@try {
			<StreamedQueryView value$={value$} />
		} @pending {
			<i class="streamed-query-pending">{'waiting'}</i>
		}
	</main>
}

function StreamedQueryGate(props: { gate?: Promise<void> }) @{
	if (props.gate) use(props.gate);
	<></>
}

export function NestedStreamedRootQuery(props: StreamedQueryProps) @{
	const value$ = query$(() => 'conversation', props.load, { kind: 'stream' });
	<main>
		@try {
			<section>
				@try {
					<StreamedQueryView value$={value$} />
				} @pending {
					<i class="streamed-query-inner-pending">{'inner waiting'}</i>
				}
				<StreamedQueryGate gate={props.gate} />
			</section>
		} @pending {
			<i class="streamed-query-pending">{'waiting'}</i>
		}
	</main>
}

export function DirectRootQuery(props: StreamedQueryProps) @{
	const value$ = query$(() => 'conversation', props.load, { kind: 'stream' });
	<StreamedQueryView value$={value$} />
}

interface RenderedStreamedProps {
	render: (value: string) => void;
	snapshot: boolean;
}

function RenderedStreamedView(props: { value$: QuerySignal<string> } & RenderedStreamedProps) @{
	const value = props.value$.get();
	// Only a snapshot read observes whether the stream has completed.
	const text = props.snapshot
		? value + (props.value$.snapshot().complete ? ':complete' : ':open')
		: value;
	props.render(text);
	<output>{text}</output>
}

// The view reads the stream in its body, so adoption release decides whether it renders again.
export function RenderedStreamedQuery(props: StreamedQueryProps & RenderedStreamedProps) @{
	const value$ = query$(() => 'conversation', props.load, { kind: 'stream' });
	<main>
		@try {
			<RenderedStreamedView value$={value$} render={props.render} snapshot={props.snapshot} />
		} @pending {
			<i class="streamed-query-pending">{'waiting'}</i>
		}
	</main>
}
