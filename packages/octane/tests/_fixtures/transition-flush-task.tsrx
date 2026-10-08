import {
	startTransition,
	use,
	useActionState,
	useLayoutEffect,
	useOptimistic,
	useState,
	useTransition,
	ViewTransition,
} from 'octane';

// Fixtures for transition-flush-task.test.ts (#1864). Each component reports
// every commit from a layout effect, so the test can compare the commit order
// with host tasks it armed before an update burst.

interface ActionProbeProps {
	action: (previous: number, payload: number) => number | Promise<number>;
	expose: (dispatch: (payload: number) => void) => void;
	onCommit: (entry: string) => void;
}

export function ActionProbe(props: ActionProbeProps) @{
	const [state, dispatch, isPending] = useActionState(props.action, 0);
	props.expose(dispatch);
	useLayoutEffect(() => {
		props.onCommit(`${state}${isPending ? 'P' : ''}`);
	}, null);
	<span>{`${state}${isPending ? 'P' : ''}`}</span>
}

interface StateProbeProps {
	expose: (setValue: (value: number) => void) => void;
	onCommit: (entry: string) => void;
}

export function StateProbe(props: StateProbeProps) @{
	const [value, setValue] = useState(0);
	props.expose(setValue);
	useLayoutEffect(() => {
		props.onCommit(String(value));
	}, null);
	<output>{String(value)}</output>
}

interface TransitionButtonProps {
	onCommit: (entry: string) => void;
	onPress: (start: (fn: () => void | Promise<unknown>) => void) => void;
}

function TransitionButton(props: TransitionButtonProps) @{
	const [isPending, start] = useTransition();
	useLayoutEffect(() => {
		props.onCommit(isPending ? 'button pending' : 'button idle');
	}, null);
	<button onClick={() => props.onPress(start)}>{isPending ? 'pending' : 'idle'}</button>
}

function Panel(props: StateProbeProps) @{
	const [value, setValue] = useState(0);
	props.expose(setValue);
	useLayoutEffect(() => {
		props.onCommit(`panel ${value}`);
	}, null);
	<p>{`panel ${value}`}</p>
}

interface PendingPanelProps {
	expose: (setValue: (value: number) => void) => void;
	onCommit: (entry: string) => void;
	onPress: (start: (fn: () => void | Promise<unknown>) => void) => void;
}

// The pending cue and the transition's own update live in different components.
export function PendingPanel(props: PendingPanelProps) @{
	<>
		<TransitionButton onCommit={props.onCommit} onPress={props.onPress} />
		<Panel expose={props.expose} onCommit={props.onCommit} />
	</>
}

interface OptimisticProbeProps {
	expose: (save: (value: number, done: Promise<void>) => void) => void;
	onCommit: (entry: string) => void;
}

export function OptimisticProbe(props: OptimisticProbeProps) @{
	const [value, setValue] = useState(0);
	const [optimistic, addOptimistic] = useOptimistic(value);
	props.expose((next, done) => {
		startTransition(async () => {
			addOptimistic(next);
			await done;
			startTransition(() => setValue(next));
		});
	});
	useLayoutEffect(() => {
		props.onCommit(`${value}/${optimistic}`);
	}, null);
	<output>{`${value}/${optimistic}`}</output>
}

function Reader(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<p>{value as string}</p>
}

interface HeldPanelProps {
	initial: Promise<string>;
	expose: (setPromise: (promise: Promise<string>) => void) => void;
}

function HeldPanel(props: HeldPanelProps) @{
	const [promise, setPromise] = useState(props.initial);
	props.expose(setPromise);
	@try {
		<Reader promise={promise} />
	} @pending {
		<p>{'loading'}</p>
	}
}

interface HeldPendingPanelProps extends HeldPanelProps {
	onCommit: (entry: string) => void;
	onPress: (start: (fn: () => void | Promise<unknown>) => void) => void;
}

// The pending cue commits first; the transition then suspends in its own task.
export function HeldPendingPanel(props: HeldPendingPanelProps) @{
	<>
		<TransitionButton onCommit={props.onCommit} onPress={props.onPress} />
		<HeldPanel initial={props.initial} expose={props.expose} />
	</>
}

// A controlled input whose value updates only inside a transition.
export function TransitionInput() @{
	const [value, setValue] = useState('');
	<>
		<input
			value={value}
			onInput={(event: Event) => {
				const next = (event.currentTarget as HTMLInputElement).value;
				startTransition(() => setValue(next));
			}}
		/>
		<ViewTransition>
			<p>{value as string}</p>
		</ViewTransition>
	</>
}

interface ViewTransitionPairProps {
	exposeA: (setValue: (value: number) => void) => void;
	exposeB: (setValue: (value: number) => void) => void;
}

// Two independent components; only the second sits in a ViewTransition.
export function ViewTransitionPair(props: ViewTransitionPairProps) @{
	<>
		<StateProbe expose={props.exposeA} onCommit={() => {}} />
		<ViewTransition>
			<StateProbe expose={props.exposeB} onCommit={() => {}} />
		</ViewTransition>
	</>
}
