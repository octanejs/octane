/** @jsxImportSource octane */
import { derived$, type SignalHandle, type SignalSnapshot } from 'octane/signals';

export function EqualPending(props: {
	ready$: SignalHandle<boolean>;
	waiting: Promise<void>;
	version: number;
	onRender: (value$: SignalHandle<string>, snapshot: SignalSnapshot<string>) => void;
	onEvent: (value$: SignalHandle<string>, snapshot: SignalSnapshot<string>) => void;
}) @{
	const value$ = derived$(() => {
		if (!props.ready$.get()) throw props.waiting;
		return `ready:${props.version}`;
	});
	const snapshot = value$.snapshot();
	props.onRender(value$, snapshot);
	<main>
		<button onClick={() => props.onEvent(value$, value$.snapshot())}>{'capture'}</button>
		<p>
			{snapshot.status === 'ready' ? snapshot.value : snapshot.status}
		</p>
	</main>
}

function PendingReader(props: { source$: SignalHandle<string> }) @{
	const result$ = derived$(async ({ read }) => await read(props.source$));
	const result = result$.snapshot();
	<span>
		{result.status === 'ready' ? result.value : result.status}
	</span>
}

export function EqualPendingChild(props: {
	ready$: SignalHandle<boolean>;
	waiting: Promise<void>;
	version: number;
}) @{
	const value$ = derived$(() => {
		if (!props.ready$.get()) throw props.waiting;
		return `ready:${props.version}`;
	});
	const snapshot = value$.snapshot();
	<main>
		<p>
			{snapshot.status === 'ready' ? snapshot.value : snapshot.status}
		</p>
		<PendingReader source$={value$} />
	</main>
}
