/** @jsxImportSource octane */
import { useState } from 'octane';
import { derived$, query$, signal$, type SignalHandle } from 'octane/signals';

export type LoopProps = { onRender: () => void };

// A local derived$ captures an object the body creates on every render, and its
// result is a new object each time. Accepting each render publishes a changed
// value to the dependent this component reads, which renders it again.
export function CapturedObjectChain(props: LoopProps) @{
	props.onRender();
	const [tick, setTick] = useState(0);
	const base$ = signal$(1);
	const opts = { n: 1 };
	const d$ = derived$(() => ({ v: base$.get(), opts }));
	const v$ = derived$(() => d$.get().v);
	<section>
		<button id="tick" onClick={() => setTick(tick + 1)}>{'Tick'}</button>
		<output>{`${tick}:${v$.get()}`}</output>
	</section>
}

type Format = { suffix: string };

const decorate = (value: string, format: Format) => value + format.suffix;

export type QueryProps = {
	load: (key: string) => Promise<string>;
	onRender: () => void;
};

// The same capture, over a query that is still pending or has failed. Every
// render presents the same pending read or error through a new definition, and
// the dependent this component reads keeps its committed value.
export function CapturedQueryChain(props: QueryProps) @{
	props.onRender();
	const [tick, setTick] = useState(0);
	const format = { suffix: '!' };
	const source$ = query$(() => 'source', props.load);
	const label$ = derived$(() => decorate(source$.get(), format));
	const shown$ = derived$(() => {
		const result = label$.snapshot();
		return result.status === 'ready' ? result.value : result.status;
	});
	<section>
		<button id="tick" onClick={() => setTick(tick + 1)}>{'Tick'}</button>
		<output>{`${tick}:${shown$.get()}`}</output>
	</section>
}

export type WaitProps = {
	load: (key: string) => Promise<string>;
	onWait: (waiting: unknown) => void;
};

// A redeclared definition waits on a different pending query than the one it
// replaced, and the replaced query, still read here, can settle first. The
// event handler reads the component's committed cell.
export function SwitchedPendingChain({ select, load, onWait }: WaitProps & {
	select: { key: string };
}) @{
	const a$ = query$(() => 'a', load);
	const b$ = query$(() => 'b', load);
	const value$ = derived$(() => (select.key === 'a' ? a$.get() : b$.get()) + '!');
	const read = () => {
		try {
			value$.get();
		} catch (waiting) {
			onWait(waiting);
		}
	};
	const value = value$.snapshot();
	<section>
		<button id="read" onClick={read}>{'Read'}</button>
		<output id="a">{a$.snapshot().status}</output>
		<output id="value">
			{value.status === 'ready' ? value.value : value.status}
		</output>
	</section>
}

// A signal the committed definition reads changes while its query is pending,
// so that definition is out of date when the render redeclaring it is accepted.
export function StalePendingChain({ load, onWait }: WaitProps) @{
	const count$ = signal$(1);
	const format = { suffix: '!' };
	const source$ = query$(() => 'source', load);
	const label$ = derived$(() => count$.get() + decorate(source$.get(), format));
	const read = () => {
		try {
			label$.get();
		} catch (waiting) {
			onWait(waiting);
		}
	};
	const label = label$.snapshot();
	<section>
		<button id="count" onClick={() => count$.set(count$.get() + 1)}>{String(count$.get())}</button>
		<button id="read" onClick={read}>{'Read'}</button>
		<output id="value">
			{label.status === 'ready' ? label.value : label.status}
		</output>
	</section>
}

function AsyncReader(props: { source$: SignalHandle<string> }) @{
	const result$ = derived$(async ({ read }) => await read(props.source$));
	const result = result$.snapshot();
	<output id="reader">
		{result.status === 'ready' ? result.value : result.status}
	</output>
}

export type Load = { readonly promise: Promise<void>; value?: string };

export type ThrownProps = {
	ready$: SignalHandle<boolean>;
	load: Load;
	onWait: (waiting: unknown) => void;
};

// #1763: a redeclared definition throws a different thenable than the one it
// replaced, while reading the same signal, and a child reads it asynchronously.
export function SwitchedThrownChain(props: ThrownProps) @{
	const value$ = derived$(() => {
		if (!props.ready$.get() || props.load.value === undefined) throw props.load.promise;
		return props.load.value;
	});
	const read = () => {
		try {
			value$.get();
		} catch (waiting) {
			props.onWait(waiting);
		}
	};
	const value = value$.snapshot();
	<section>
		<button id="read" onClick={read}>{'Read'}</button>
		<output id="value">
			{value.status === 'ready' ? value.value : value.status}
		</output>
		<AsyncReader source$={value$} />
	</section>
}

export type AsyncSwitchProps = {
	replaced: Promise<void>;
	result: Promise<string>;
	started: boolean;
	onAttempt: (signal: AbortSignal) => void;
};

// A redeclared definition starts asynchronous work in place of a thrown thenable.
export function ThrownThenAsync(props: AsyncSwitchProps) @{
	const value$ = derived$(({ signal }) => {
		if (!props.started) throw props.replaced;
		props.onAttempt(signal);
		return props.result;
	});
	const value = value$.snapshot();
	<output id="value">
		{value.status === 'ready' ? value.value : value.status}
	</output>
}
