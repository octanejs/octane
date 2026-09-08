import { useState, useTransition, useOptimistic } from 'octane';

export function AsyncActionEvents(props: {
	gate: Promise<void>;
	transition: boolean;
	resume?: Promise<void>;
	onResume?: () => void;
	stopPropagation?: boolean;
}) @{
	const [saved, setSaved] = useState('initial');
	const [count, setCount] = useState(0);
	const [pending, start] = useTransition();
	const increment = (event: Event) => {
		if (props.stopPropagation) event.stopPropagation();
		if (props.transition) start(() => setCount((value) => value + 1));
		else setCount((value) => value + 1);
	};
	<div>
		<button
			id="event-action"
			type="button"
			onClick={() => start(async () => {
				setSaved('started');
				await props.resume;
				setSaved('awaited');
				props.onResume?.();
				await props.gate;
				setSaved('finished');
			})}
		>Start action</button>
		<button id="event-pointermove" type="button" onPointerMove={increment}>Pointer move</button>
		<button id="event-mousemove" type="button" onMouseMoveCapture={increment}>Mouse move</button>
		<button id="event-wheel" type="button" onWheel={increment}>Wheel</button>
		<div id="event-scroll" onScroll={increment}>Scroll</div>
		<button id="event-pointerdown" type="button" onPointerDown={increment}>Pointer down</button>
		<button id="event-click" type="button" onClickCapture={increment}>Click</button>
		<output id="event-count">{String(count)}</output>
		<output id="event-saved">{saved as string}</output>
		<output id="event-pending">
			{pending ? 'pending' : 'idle'}
		</output>
	</div>
}

// useOptimistic rebases the pending optimistic update on top of a passthrough that
// changes mid-action, using a CUSTOM reducer. Per ReactAsyncActions-test.js:685 / :887.
interface OptimisticRebaseProps {
	gate: Promise<void>;
	bind: (api: { add: () => void; bumpSaved: () => void }) => void;
}

export function OptimisticRebase(props: OptimisticRebaseProps) @{
	const [saved, setSaved] = useState(1);
	const [isPending, start] = useTransition();
	const [optimistic, addOptimistic] = useOptimistic(saved, (n: number, delta: number) => n + delta);
	props.bind({
		add: () => start(async () => {
			addOptimistic(1);
			await props.gate;
			setSaved((s: number) => s + 1);
		}),
		bumpSaved: () => setSaved((s: number) => s + 1),
	});
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<span id="opt">{String(optimistic)}</span>
		<span id="saved">{String(saved)}</span>
	</div>
}

// Several addOptimistic calls in ONE async action all fold onto the passthrough.
// Per ReactAsyncActions-test.js:1141 "useOptimistic can update repeatedly in the same async action".
interface OptimisticRepeatedProps {
	gate: Promise<void>;
	bind: (run: () => void) => void;
}

export function OptimisticRepeated(props: OptimisticRepeatedProps) @{
	const [saved, setSaved] = useState(0);
	const [isPending, start] = useTransition();
	const [optimistic, addOptimistic] = useOptimistic(saved, (n: number, delta: number) => n + delta);
	props.bind(
		() => start(async () => {
			addOptimistic(1);
			addOptimistic(1);
			addOptimistic(1);
			await props.gate;
			setSaved(3);
		}),
	);
	<div>
		<span id="pending">
			{isPending ? '1' : '0'}
		</span>
		<span id="opt">{String(optimistic)}</span>
		<span id="saved">{String(saved)}</span>
	</div>
}
