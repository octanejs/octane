import { ViewTransition } from 'octane';
import {
	captureSignalOwner,
	currentSignalOwner,
	derived$,
	type SignalHandle,
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
