import { derived$, type SignalHandle } from 'octane/signals';

export interface SwitchedPendingProps {
	ready$: SignalHandle<boolean>;
	waiting: Promise<void>;
}

function Reader(props: { source$: SignalHandle<string> }) @{
	const result$ = derived$(async ({ read }) => await read(props.source$));
	const result = result$.snapshot();
	<span>
		{result.status === 'ready' ? result.value : result.status}
	</span>
}

export function SwitchedPending(props: SwitchedPendingProps) @{
	const value$ = derived$(() => {
		if (!props.ready$.get()) throw props.waiting;
		return 'ready';
	});
	const current = value$.snapshot();
	<main>
		<p>
			{current.status === 'ready' ? current.value : current.status}
		</p>
		<Reader source$={value$} />
	</main>
}
