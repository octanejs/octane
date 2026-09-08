import {
	flushSync,
	useActionState,
	useOptimistic,
	useSyncExternalStore,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useState,
} from 'octane';

export function DependencyLength(props: {
	deps: unknown[];
	label: string;
	log: (message: string) => void;
}) @{
	const label = useMemo(() => props.label, props.deps);
	useEffect(() => {
		props.log(props.label);
	}, props.deps);
	<span>{label}</span>
}

export function EffectReturn(props: { value: unknown }) @{
	useEffect(() => props.value as any, []);
	<span>mounted</span>
}

export function InsertionUpdate() @{
	const [value, setValue] = useState(0);
	useInsertionEffect(() => {
		setValue(1);
	}, []);
	<span>{String(value)}</span>
}

export function LifecycleFlush(props: { passive: boolean; invoke: () => void }) @{
	useLayoutEffect(() => {
		if (!props.passive) flushSync(props.invoke);
	}, []);
	useEffect(() => {
		if (props.passive) flushSync(props.invoke);
	}, []);
	<span>mounted</span>
}

export function NamedActUpdates(props: { bind: (set: (value: number) => void) => void }) @{
	const [value, setValue] = useState(0);
	props.bind(setValue);
	<span>{String(value)}</span>
}

function SnapshotRead(props: { get: () => { value: number } }) @{
	const snapshot = useSyncExternalStore(() => () => {}, props.get);
	<span>{String(snapshot.value)}</span>
}

export function CaughtSnapshotRead(props: { get: () => { value: number } }) @{
	<div>
		@try {
			<SnapshotRead get={props.get} />
		} @catch (error) {
			<p>{String(error.message)}</p>
		}
	</div>
}

export function ActionWarning(props: {
	kind: 'optimistic' | 'sync' | 'async';
	bind: (update: () => void) => void;
}) @{
	const [optimistic, add] = useOptimistic(0, (state: number, value: number) => state + value);
	const [value, dispatch] = useActionState(
		(state: number) => props.kind === 'async' ? Promise.resolve(state + 1) : state + 1,
		0,
	);
	props.bind(props.kind === 'optimistic' ? () => add(1) : () => dispatch());
	<span>{String(optimistic + value)}</span>
}
