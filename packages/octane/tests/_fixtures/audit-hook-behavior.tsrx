import {
	startTransition,
	memo,
	use,
	useCallback,
	useDeferredValue,
	useEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
} from 'octane';

export function RepeatedTransitionFlag(props: { repeats: number }) @{
	const [pending, setPending] = useState(false);
	<button
		onClick={() => {
			for (let i = 0; i < props.repeats; i++) {
				setPending(true);
				startTransition(() => setPending(false));
			}
		}}
	>{String(pending)}</button>
}

export function QueuedStateOrder(props: {
	steps: Array<{ value: number; transition: boolean }>;
	read: (value: number) => void;
}) @{
	const [value, setValue, getValue] = useState(0);
	<button
		onClick={() => {
			for (const step of props.steps) {
				const update = () => setValue((previous) => previous * 10 + step.value);
				if (step.transition) startTransition(update);
				else update();
			}
			props.read(getValue());
		}}
	>{String(value)}</button>
}

export function QueuedReducerOrder(props: {
	steps: Array<{ value: number; transition: boolean }>;
	read: (value: number) => void;
}) @{
	const [value, dispatch, getValue] = useReducer(
		(previous: number, digit: number) => previous * 10 + digit,
		0,
	);
	<button
		onClick={() => {
			for (const step of props.steps) {
				const update = () => dispatch(step.value);
				if (step.transition) startTransition(update);
				else update();
			}
			props.read(getValue());
		}}
	>{String(value)}</button>
}

export function AsyncQueuedStateOrder(props: {
	reducer: boolean;
	urgent: 'replace' | 'append';
	gate: Promise<void>;
	read: (value: number) => void;
}) @{
	const [state, setState, getState] = useState(0);
	const [reduced, dispatch, getReduced] = useReducer(
		(previous: number, action: { value: number; replace: boolean }) => action.replace
			? action.value
			: previous * 10 + action.value,
		0,
	);
	const [pending, start] = useTransition();
	<div>
		<button
			id="action"
			onClick={() => start(async () => {
				if (props.reducer) dispatch({ value: 1, replace: false });
				else setState((previous) => previous * 10 + 1);
				await props.gate;
			})}
		>action</button>
		<button
			id="urgent"
			onClick={() => {
				if (props.reducer) dispatch({ value: 2, replace: props.urgent === 'replace' });
				else if (props.urgent === 'replace') setState(2);
				else setState((previous) => previous * 10 + 2);
				props.read(props.reducer ? getReduced() : getState());
			}}
		>urgent</button>
		<p>{String(props.reducer ? reduced : state)}</p>
		<span>{String(pending)}</span>
	</div>
}

export function AsyncInterleavedStateOrder(props: {
	reducer: boolean;
	gate: Promise<void>;
	read: (value: number) => void;
}) @{
	const [state, setState, getState] = useState(0);
	const [reduced, dispatch, getReduced] = useReducer(
		(previous: number, digit: number) => previous * 10 + digit,
		0,
	);
	const [, start] = useTransition();
	const append = (digit: number) => {
		if (props.reducer) dispatch(digit);
		else setState((previous) => previous * 10 + digit);
	};
	<div>
		<button
			id="action"
			onClick={() => {
				append(1);
				startTransition(() => append(2));
				start(async () => {
					append(3);
					await props.gate;
				});
				props.read(props.reducer ? getReduced() : getState());
			}}
		>action</button>
		<button
			id="urgent"
			onClick={() => {
				append(4);
				startTransition(() => append(5));
				append(6);
				props.read(props.reducer ? getReduced() : getState());
			}}
		>urgent</button>
		<p>{String(props.reducer ? reduced : state)}</p>
	</div>
}

function KeyedChild() @{
	const [value, setValue] = useState(0);
	<button onClick={() => setValue(value + 1)}>{String(value)}</button>
}

export function CoercedComponentKey(props: { value: unknown }) @{
	<KeyedChild key={props.value as any} />
}

function Inner(props: { value: string }) @{
	<span>{props.value}</span>
}

const MemoInner = memo(Inner, () => true);
function Wrapper(props: { value: string }) @{
	<section>
		{props.value}
		<MemoInner value={props.value} />
	</section>
}
// The same descriptor-copying strategy used by hoist-non-react-statics.
for (const key of Reflect.ownKeys(MemoInner)) {
	if (
		key !== 'name' && key !== 'length' && key !== 'prototype' && key !== 'arguments' &&
			key !== 'caller'
	) {
		Object.defineProperty(Wrapper, key, Object.getOwnPropertyDescriptor(MemoInner, key)!);
	}
}

export function HoistedMemo(props: { value: string }) @{
	<Wrapper value={props.value} />
}

export function FreshReducer() @{
	const [factor, setFactor] = useState(1);
	const [value, dispatch] = useReducer(
		(state: number, action: number) => state + factor * action,
		0,
	);
	<button
		onClick={() => {
			setFactor(10);
			dispatch(1);
		}}
	>{String(value)}</button>
}

export function FreshTransitionReducer() @{
	const [factor, setFactor] = useState(1);
	const [value, dispatch] = useReducer(
		(state: number, action: number) => state + factor * action,
		0,
	);
	const [, start] = useTransition();
	<button
		onClick={() => start(() => {
			setFactor(10);
			dispatch(1);
		})}
	>{String(value)}</button>
}

function ThrowingUpdates(props: { reducer: boolean }) @{
	const [, setValue] = useState(0);
	const [, dispatch] = useReducer((): number => {
		throw new Error('reducer failed');
	}, 0);
	<button
		onClick={() => {
			if (props.reducer) dispatch(1);
			else setValue(() => {
				throw new Error('updater failed');
			});
		}}
	>update</button>
}

export function CaughtUpdates(props: { reducer: boolean }) @{
	<div>
		@try {
			<ThrowingUpdates reducer={props.reducer} />
		} @catch (error) {
			<p>{String(error.message)}</p>
		}
	</div>
}

function PendingThrowingUpdater(props: {
	wait: Promise<void>;
	bind: (start: () => void) => void;
}) @{
	const [, setValue] = useState(0);
	const [pending, start] = useTransition();
	props.bind(
		() => start(async () => {
			setValue(() => {
				throw new Error('staged updater failed');
			});
			await props.wait;
		}),
	);
	<span>
		{pending ? 'pending' : 'ready'}
	</span>
}

export function CaughtPendingUpdater(props: {
	wait: Promise<void>;
	bind: (start: () => void) => void;
}) @{
	<div>
		@try {
			<PendingThrowingUpdater wait={props.wait} bind={props.bind} />
		} @catch (error) {
			<p>{String(error.message)}</p>
		}
	</div>
}

export function FreshUpdater() @{
	const ref = useRef(1);
	const [value, setValue] = useState(0);
	<button
		onClick={() => {
			setValue(100);
			setValue((old) => old + ref.current);
			ref.current = 100;
		}}
	>{String(value)}</button>
}

export function FreshTransitionUpdater(props: { noop?: boolean }) @{
	const ref = useRef(props.noop ? 0 : 1);
	const [value, setValue] = useState(0);
	const [, start] = useTransition();
	<button
		onClick={() => start(() => {
			setValue(props.noop ? 0 : 100);
			setValue((old) => old + ref.current);
			ref.current = 100;
		})}
	>{String(value)}</button>
}

export function PassiveCleanup(props: { log: (message: string) => void }) @{
	useEffect(() => {
		props.log('effect');
		return () => props.log('cleanup');
	}, []);
	<span>mounted</span>
}

function MountChild(props: { value: number; log: (message: string) => void }) @{
	useEffect(() => {
		props.log('effect ' + props.value);
	}, [props.value]);
	<span>{String(props.value)}</span>
}

export function MountSelfUpdate(props: { log: (message: string) => void }) @{
	const [value, setValue] = useState(0);
	if (value === 0) setValue(1);
	<MountChild value={value} log={props.log} />
}

// A memo factory runs during render, so its self-update must replay setup
// before the child mounts, exactly like a bare setter call in setup.
export function MemoFactorySelfUpdate(props: { log: (message: string) => void }) @{
	const [value, setValue] = useState(0);
	const doubled = useMemo(() => {
		if (value === 0) setValue(1);
		return value * 2;
	}, [value]);
	<MountChild value={doubled} log={props.log} />
}

export function IndependentTransitions(props: {
	bind: (first: (fn: () => void | Promise<unknown>) => void, second: (fn: () => | void
	| Promise<unknown>) => void) => void;
}) @{
	const [first, startFirst] = useTransition();
	const [second, startSecond] = useTransition();
	props.bind(startFirst, startSecond);
	<span>{String(first) + ':' + String(second)}</span>
}

function ThrowingTransition(props: {
	bind: (start: (fn: () => void | Promise<unknown>) => void) => void;
}) @{
	const [, start] = useTransition();
	props.bind(start);
	<span>ready</span>
}

export function CaughtTransition(props: {
	bind: (start: (fn: () => void | Promise<unknown>) => void) => void;
}) @{
	<div>
		@try {
			<ThrowingTransition bind={props.bind} />
		} @catch (error) {
			<p>{String(error.message)}</p>
		}
	</div>
}

function InsertedRow(props: { name: string; log: (message: string) => void }) @{
	const ref = useCallback((node: HTMLLIElement | null) => {
		if (node !== null) props.log('ref ' + props.name);
	}, []);
	useLayoutEffect(() => {
		props.log('layout ' + props.name);
	}, []);
	useEffect(() => {
		props.log('passive ' + props.name);
	}, []);
	<li ref={ref}>{props.name}</li>
}

export function OrderedInsertion(props: { names: string[]; log: (message: string) => void }) @{
	<ul>
		@for (const name of props.names; key name) {
			<InsertedRow name={name} log={props.log} />
		}
	</ul>
}

function DeferredResult(props: {
	value: number;
	promiseFor: (value: number) => PromiseLike<number>;
}) @{
	const value = use(props.promiseFor(props.value));
	<span>{String(value)}</span>
}

export function DeferredCue(props: {
	value: number;
	promiseFor: (value: number) => PromiseLike<number>;
}) @{
	const deferred = useDeferredValue(props.value);
	<section data-stale={props.value !== deferred ? 'yes' : 'no'}>
		@try {
			<DeferredResult value={deferred} promiseFor={props.promiseFor} />
		} @pending {
			<p>loading</p>
		}
	</section>
}

export function UrgentSuspendingValue(props: {
	promiseFor: (value: number) => PromiseLike<number>;
	bind: (transition: (value: number) => void, urgent: (value: number) => void) => void;
}) @{
	const [value, setValue] = useState(1);
	const [pending, start] = useTransition();
	props.bind((next) => start(() => setValue(next)), setValue);
	<div>
		<b>{String(pending)}</b>
		@try {
			<DeferredResult value={value} promiseFor={props.promiseFor} />
		} @pending {
			<p>loading</p>
		}
	</div>
}

export function TransitionStore(props: {
	get: () => number;
	subscribe: (listener: () => void) => () => void;
	promiseFor: (value: number) => PromiseLike<number>;
	bind: (start: (fn: () => void) => void) => void;
}) @{
	const value = useSyncExternalStore(props.subscribe, props.get);
	const [pending, start] = useTransition();
	props.bind(start);
	<div>
		<b>{String(pending)}</b>
		@try {
			<DeferredResult value={value} promiseFor={props.promiseFor} />
		} @pending {
			<p>loading</p>
		}
	</div>
}

function PassiveChain(props: { cleanup: boolean }) @{
	const [value, setValue] = useState(0);
	useEffect(() => {
		if (props.cleanup) {
			return () => {
				if (value < 59) setValue((current) => current + 1);
			};
		}
		if (value < 60) setValue(value + 1);
	}, [value]);
	useEffect(() => {
		if (props.cleanup) setValue(1);
	}, []);
	<span>{String(value)}</span>
}

export function CaughtPassiveChain(props: { cleanup: boolean }) @{
	<div>
		@try {
			<PassiveChain cleanup={props.cleanup} />
		} @catch (error) {
			<p>{String(error.message)}</p>
		}
	</div>
}

function CrossRenderChild(props: { value: number; setValue: (value: number) => void }) @{
	if (props.value < 40) props.setValue(props.value + 1);
	<span>{String(props.value)}</span>
}

export function FiniteCrossRender() @{
	const [value, setValue] = useState(0);
	<CrossRenderChild value={value} setValue={setValue} />
}

function CommitSibling(props: {
	name: string;
	fail: boolean;
	passive: boolean;
	log: (value: string) => void;
}) @{
	useLayoutEffect(() => {
		if (props.passive) return;
		props.log('layout ' + props.name);
		if (props.fail) throw new Error('commit failed');
		return () => props.log('layout cleanup ' + props.name);
	}, []);
	useEffect(() => {
		if (!props.passive) return;
		props.log('passive ' + props.name);
		if (props.fail) throw new Error('commit failed');
		return () => props.log('passive cleanup ' + props.name);
	}, []);
	<span>{props.name}</span>
}

export function CaughtCommitSiblings(props: { passive: boolean; log: (value: string) => void }) @{
	<div>
		@try {
			<section>
				<CommitSibling name="first" fail={true} passive={props.passive} log={props.log} />
				<CommitSibling name="second" fail={false} passive={props.passive} log={props.log} />
			</section>
		} @catch (error) {
			<p>{String(error.message)}</p>
		}
	</div>
}
