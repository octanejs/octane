import { startTransition, useState, useTransition } from 'octane';

export type EventPhase = 'capture' | 'bubble';
export type ActionProbeOptions = {
	phase: EventPhase;
	transition?: boolean;
	postAwait?: boolean;
};

export type ActionProbeProps =
	ActionProbeOptions & {
		gate: Promise<void>;
		record(label: string, event: Event): void;
	};

export function ContinuousActionProbe(props: ActionProbeProps) @{
	const [moves, setMoves] = useState(0);
	const [saved, setSaved] = useState('initial');
	const [pending, start] = useTransition();
	const move = (event: MouseEvent) => {
		props.record('before', event);
		if (props.transition) startTransition(() => setMoves((value) => value + 1));
		else setMoves((value) => value + 1);
		props.record('after', event);
	};
	const handlers =
		props.phase === 'capture' ? { onMouseMoveCapture: move } : { onMouseMove: move };
	<section>
		<button
			data-start
			onClick={() => start(async () => {
				setSaved('started');
				await props.gate;
				setSaved('finished');
			})}
		>Start action</button>
		<div data-move {...handlers}>Move here</div>
		<output data-moves>{String(moves)}</output>
		<output data-saved>{saved as string}</output>
		<output data-pending>
			{pending ? 'pending' : 'idle'}
		</output>
	</section>
}

export function PostAwaitActionProbe(props: ActionProbeProps) @{
	const [saved, setSaved] = useState('initial');
	const [pending, start] = useTransition();
	const begin = (event: MouseEvent) => start(async () => {
		await Promise.resolve();
		setSaved('intermediate');
		props.record('continuation', event);
		await props.gate;
		setSaved('finished');
	});
	const handlers =
		props.phase === 'capture' ? { onClickCapture: begin } : { onClick: begin };
	<section>
		<button data-start {...handlers}>Start action</button>
		<output data-saved>{saved as string}</output>
		<output data-pending>
			{pending ? 'pending' : 'idle'}
		</output>
	</section>
}
