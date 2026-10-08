import {
	addTransitionType,
	startTransition,
	use,
	useActionState,
	useDeferredValue,
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

export interface TabsControls {
	start: (fn: () => void | Promise<unknown>) => void;
	setTab: (tab: string | ((tab: string) => string)) => void;
	setCount: (count: number) => void;
}

interface PendingTabsProps {
	onCommit: (entry: string) => void;
	expose?: (controls: TabsControls) => void;
	onPress?: (controls: TabsControls) => void;
}

// The pending cue and the transition's own update live in the same component,
// the canonical useTransition pattern.
export function PendingTabs(props: PendingTabsProps) @{
	const [isPending, start] = useTransition();
	const [tab, setTab] = useState('a');
	const [count, setCount] = useState(0);
	const controls = { start, setTab, setCount };
	props.expose?.(controls);
	const label = `${tab}${count === 0 ? '' : String(count)} ${isPending ? 'pending' : 'idle'}`;
	useLayoutEffect(() => {
		props.onCommit(label);
	}, null);
	<button
		onClick={() => {
			if (props.onPress) props.onPress(controls);
			else start(() => setTab('b'));
		}}
	>
		{label}
	</button>
}

interface PendingTabsPanelProps extends PendingTabsProps {
	exposePanel: (setValue: (value: number) => void) => void;
}

// The same component, beside a sibling that also takes part in its transitions.
export function PendingTabsPanel(props: PendingTabsPanelProps) @{
	<>
		<PendingTabs expose={props.expose} onCommit={props.onCommit} onPress={props.onPress} />
		<Panel expose={props.exposePanel} onCommit={props.onCommit} />
	</>
}

interface HeldPendingTabsProps extends HeldPanelProps {
	onCommit: (entry: string) => void;
	next: Promise<string>;
}

// The cue and the suspending transition state share one component.
export function HeldPendingTabs(props: HeldPendingTabsProps) @{
	const [isPending, start] = useTransition();
	const [promise, setPromise] = useState(props.initial);
	props.expose(setPromise);
	useLayoutEffect(() => {
		props.onCommit(isPending ? 'pending' : 'idle');
	}, null);
	<>
		<button onClick={() => start(() => setPromise(props.next))}>
			{isPending ? 'pending' : 'idle'}
		</button>
		@try {
			<Reader promise={promise} />
		} @pending {
			<p>{'loading'}</p>
		}
	</>
}

interface OptimisticTabsProps {
	onCommit: (entry: string) => void;
}

// An optimistic cue and the transition's own update in one component.
export function OptimisticTabs(props: OptimisticTabsProps) @{
	const [value, setValue] = useState(0);
	const [optimistic, addOptimistic] = useOptimistic(value);
	useLayoutEffect(() => {
		props.onCommit(`${value}/${optimistic}`);
	}, null);
	<button
		onClick={() =>
			startTransition(() => {
				addOptimistic(1);
				setValue(1);
			})
		}
	>
		{`${value}/${optimistic}`}
	</button>
}

interface ViewTransitionTabsProps {
	onUpdate: (types: string[]) => void;
}

// The cue sits outside the ViewTransition; the transition's own update inside it.
export function ViewTransitionTabs(props: ViewTransitionTabsProps) @{
	const [isPending, start] = useTransition();
	const [tab, setTab] = useState('a');
	<>
		<button
			onClick={() =>
				start(() => {
					addTransitionType('tabs');
					setTab('bbbb');
				})
			}
		>
			{isPending ? 'pending' : 'idle'}
		</button>
		<ViewTransition onUpdate={(_instance: unknown, types: string[]) => props.onUpdate(types)}>
			<p>{tab as string}</p>
		</ViewTransition>
	</>
}

// A controlled input whose component also shows isPending for the transition.
export function PendingTransitionInput() @{
	const [isPending, start] = useTransition();
	const [text, setText] = useState('');
	const [query, setQuery] = useState('');
	<>
		<input
			value={text}
			onInput={(event: Event) => {
				const next = (event.currentTarget as HTMLInputElement).value;
				setText(next);
				start(() => setQuery(next));
			}}
		/>
		<p>{`${query} ${isPending ? 'pending' : 'idle'}`}</p>
	</>
}

export interface DeferredTabsControls {
	start: (fn: () => void | Promise<unknown>) => void;
	setQuery: (query: string) => void;
	setTab: (tab: string) => void;
}

interface DeferredPendingTabsProps {
	onCommit: (entry: string) => void;
	expose: (controls: DeferredTabsControls) => void;
	exposePanel: (setValue: (value: number) => void) => void;
}

function DeferredTabs(props: Omit<DeferredPendingTabsProps, 'exposePanel'>) @{
	const [isPending, start] = useTransition();
	const [query, setQuery] = useState('a');
	const deferred = useDeferredValue(query);
	const [tab, setTab] = useState('x');
	props.expose({ start, setQuery, setTab });
	const label = `${query}/${deferred}/${tab} ${isPending ? 'pending' : 'idle'}`;
	useLayoutEffect(() => {
		props.onCommit(label);
	}, null);
	<output>{label}</output>
}

// useDeferredValue and a pending cue in one component, beside a sibling whose
// transition can keep waiting for its task.
export function DeferredPendingTabs(props: DeferredPendingTabsProps) @{
	<>
		<DeferredTabs expose={props.expose} onCommit={props.onCommit} />
		<Panel expose={props.exposePanel} onCommit={() => {}} />
	</>
}
