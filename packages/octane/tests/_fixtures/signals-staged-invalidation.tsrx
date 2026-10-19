import { startTransition, use, ViewTransition } from 'octane';
import {
	captureSignalOwner,
	currentSignalOwner,
	derived$,
	query$,
	type SignalHandle,
	type WritableSignal,
} from 'octane/signals';

export interface PendingStagedProps {
	ready$: SignalHandle<boolean>;
	waiting: Promise<void>;
	version: number;
	capture(status: string): void;
}

function PendingChild(props: PendingStagedProps) @{
	const value$ = derived$(({ read }) => {
		void read;
		if (!props.ready$.get()) throw props.waiting;
		return 'ready:' + String(props.version);
	});
	const snapshot = value$.snapshot();
	<section>
		<button
			onClick={() => {
				const current = value$.snapshot();
				props.capture(current.status === 'ready' ? current.value : current.status);
			}}
		>
			{props.version === 0 ? 'Short' : 'Much longer content here'}
		</button>
		<output>{snapshot.status === 'ready' ? snapshot.value : snapshot.status}</output>
	</section>
}

export function PendingStaged(props: PendingStagedProps) @{
	<ViewTransition update="auto">
		<div>
			<PendingChild {...props} />
		</div>
	</ViewTransition>
}

export interface ReadyStagedProps {
	source$: SignalHandle<boolean>;
	version: number;
	capture(read: () => string): void;
}

function ReadyChild(props: ReadyStagedProps) @{
	const value$ = derived$(({ read }) => {
		void read;
		return props.source$.get() ? 'new' : 'old';
	});
	const value = value$.get();
	const run = captureSignalOwner(currentSignalOwner()!);
	<button onClick={() => props.capture(() => run(() => value$.get()))}>
		{props.version === 0 ? 'Short' : 'Much longer content here'}
		<span>{value}</span>
	</button>
}

export function ReadyStaged(props: ReadyStagedProps) @{
	<ViewTransition update="auto">
		<div>
			<ReadyChild {...props} />
		</div>
	</ViewTransition>
}

interface RedeclaredWhilePendingProps {
	route$: SignalHandle<string>;
	suffix: string;
	load(route: string): Promise<string>;
	scalar?: boolean;
}

function PendingRoute(props: RedeclaredWhilePendingProps) @{
	const route = props.route$.get();
	if (route === 'B') use(props.load(route));
	<span>gate</span>
}

export function RedeclaredWhilePending(props: RedeclaredWhilePendingProps) @{
	const selected$ = props.scalar
		? derived$(() => `${props.route$.get()}:${props.suffix}`)
		: derived$(() => props.route$.get() + ':' + props.suffix);
	const available$ = derived$(() => selected$.snapshot().status);
	const value$ = derived$(() => {
		const snapshot = selected$.snapshot();
		return snapshot.status === 'ready' ? snapshot.value : '';
	});
	<main>
		<i>{props.suffix}</i>
		<output>
			{available$.get()}|{value$.get()}
		</output>
		<PendingRoute {...props} />
	</main>
}

export function AsyncRedeclaredWhilePending(
	props: RedeclaredWhilePendingProps & {
		fetch(route: string, context: { signal: AbortSignal }): Promise<string>;
		selection?: string;
		readRequest?: boolean;
	},
) @{
	const request$ = query$(() => props.selection ?? props.route$.get(), props.fetch);
	const selected$ = derived$(
		async ({ read }) =>
			`${props.readRequest === false ? 'static' : await read(request$)}:${props.suffix}`,
	);
	const snapshot = selected$.snapshot();
	<main>
		<i>{props.suffix}</i>
		<output>{snapshot.status === 'ready' ? snapshot.value : snapshot.status}</output>
		<PendingRoute {...props} />
	</main>
}

export function NonSuspendingPending(props: {
	selected$: WritableSignal<string>;
	fetch(selection: string, context: { signal: AbortSignal }): string | Promise<string>;
	fetchAlternative(selection: string, context: { signal: AbortSignal }): string | Promise<string>;
	suffix: string;
	read: 'snapshot' | 'latest';
	dependency: 'same' | 'switch' | 'drop';
	projected: boolean;
	present: boolean;
	gate: Promise<void>;
	onRead(value: string): void;
}) @{
	const request$ = query$(() => props.selected$.get(), props.fetch);
	const alternative$ = query$(() => props.selected$.get(), props.fetchAlternative);
	const value$ = derived$(async ({ read }) => {
		const value =
			props.dependency === 'drop'
				? 'static'
				: await read(props.dependency === 'switch' ? alternative$ : request$);
		return `${value}:${props.suffix}`;
	});
	const readValue$ = () => {
		if (props.read === 'latest') return value$.latest('none');
		const snapshot = value$.snapshot();
		return snapshot.status === 'ready' ? snapshot.value : snapshot.status;
	};
	const projected$ = derived$(() => readValue$());
	<main>
		<button
			onClick={() =>
				startTransition(() => {
					props.selected$.set('B');
					if (props.projected) projected$.snapshot();
					else readValue$();
					return props.gate;
				})
			}
		>
			start
		</button>
		<button onClick={() => props.onRead(readValue$())}>read</button>
		<output>{props.present ? readValue$() : 'deferred'}</output>
	</main>
}
