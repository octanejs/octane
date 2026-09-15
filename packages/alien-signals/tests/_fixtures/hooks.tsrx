import { useMemo, useState } from 'octane';
import {
	createEffect,
	type ReadableSignal,
	type WritableSignal,
	useComputed,
	useSetSignal,
	useSignal,
	useSignalEffect,
	useSignalScope,
	useSignalValue,
	useDeferredSignalValue,
	useSignalSelector,
	useSignalPassiveEffect,
	useSignalLayoutEffect,
	useSignalInsertionEffect,
} from '@octanejs/alien-signals';

export function SignalReaders(props: {
	left: WritableSignal<number>;
	right: ReadableSignal<number>;
}) @{
	const [left, setLeft] = useSignal(props.left);
	const right = useSignalValue(props.right);
	const setLeftOnly = useSetSignal(props.left);

	<div>
		<p id="values">{left + '/' + right}</p>
		<button id="increment" onClick={() => setLeft((value) => value + 1)}>increment</button>
		<button id="set" onClick={() => setLeftOnly(10)}>set</button>
	</div>
}

export function SignalValueReader(props: { source: WritableSignal<number> }) @{
	const value = useSignalValue(props.source);
	<p id="value">{value as string}</p>
}

export function SignalTuple(props: { source: WritableSignal<number> }) @{
	const [value, setValue] = useSignal(props.source);
	<div>
		<p id="value">{value as string}</p>
		<button id="set" onClick={() => setValue(10)}>set</button>
		<button id="inc" onClick={() => setValue((previous) => previous + 1)}>inc</button>
		<button
			id="inc-twice"
			onClick={() => {
				setValue((previous) => previous + 1);
				setValue((previous) => previous + 1);
			}}
		>
			inc-twice
		</button>
	</div>
}

export function SetterOnly(props: { source: WritableSignal<number> }) @{
	const setValue = useSetSignal(props.source);
	<div>
		<button id="set" onClick={() => setValue(10)}>set</button>
		<button id="inc" onClick={() => setValue((previous) => previous + 5)}>inc</button>
	</div>
}

export function SwitchingReader(props: {
	first: WritableSignal<number>;
	second: WritableSignal<number>;
}) @{
	const [second, setSecond] = useState(false);
	const value = useSignalValue(second ? props.second : props.first);

	<div>
		<p id="switch-value">{value as string}</p>
		<button id="switch" onClick={() => setSecond(true)}>switch</button>
	</div>
}

export function ComputedReader(props: {
	source: WritableSignal<number>;
	multiplier: number;
}) @{
	const value = useComputed(() => props.source() * props.multiplier, [props.multiplier]);
	<p id="computed">{value as string}</p>
}

export function ComputedDualReader(props: {
	count: WritableSignal<number>;
	multiplier: WritableSignal<number>;
}) @{
	const value = useComputed(() => props.count() * props.multiplier(), []);
	<p id="computed">{value as string}</p>
}

export function ComputedObjectReader(props: {
	source: WritableSignal<number>;
	onRender: () => void;
}) @{
	props.onRender();
	const value = useComputed(() => ({ count: props.source() }), []);
	<p id="computed">{value.count as string}</p>
}

export function ComputedReuseReader(props: {
	source: WritableSignal<number>;
	onGetter: () => void;
}) @{
	const [, setRender] = useState(0);
	const value = useComputed(() => {
		props.onGetter();
		return props.source() * 2;
	}, []);
	<div>
		<p id="computed">{value as string}</p>
		<button id="rerender" onClick={() => setRender((value) => value + 1)}>rerender</button>
	</div>
}

export function ComputedOffsetReader(props: {
	source: WritableSignal<number>;
	offset: number;
	onGetter: () => void;
}) @{
	const value = useComputed(() => {
		props.onGetter();
		return props.source() + props.offset;
	}, [props.offset]);
	<p id="computed">{value as string}</p>
}

export function ComputedChainReader(props: {
	left: ReadableSignal<number>;
	right: ReadableSignal<number>;
}) @{
	const value = useComputed(() => props.left() + props.right(), []);
	<p id="computed">{value as string}</p>
}

export function NullableSignalReader(props: {
	source: WritableSignal<number | undefined | null>;
}) @{
	const [value, setValue] = useSignal(props.source);
	<div>
		<p id="value">{String(value)}</p>
		<button id="undef" onClick={() => setValue(undefined)}>undef</button>
		<button id="null" onClick={() => setValue(null)}>null</button>
	</div>
}

export function ObjectSignalReader(props: {
	source: WritableSignal<{ a: number; b: number }>;
}) @{
	const [value, setValue] = useSignal(props.source);
	<div>
		<p id="value">{JSON.stringify(value)}</p>
		<button id="set" onClick={() => setValue({ a: 2, b: 2 })}>set</button>
	</div>
}

export function SetterProbe(props: {
	source: WritableSignal<number>;
	record: (setter: (value: number | ((previous: number) => number)) => void) => void;
}) @{
	const [, setValue] = useSignal(props.source);
	const [, setRender] = useState(0);
	props.record(setValue);

	<button id="rerender" onClick={() => setRender((value) => value + 1)}>rerender</button>
}

export function ScopeProbe(props: {
	source: WritableSignal<number>;
	label: string;
	log: (entry: string) => void;
	onStop: (stop: () => void) => void;
}) @{
	const stop = useSignalScope(() => {
		createEffect(() => props.log(props.label + ':' + props.source()));
	});
	props.onStop(stop);

	<p id="scope-probe">{props.label}</p>
}

export function SyncStopScopeProbe(props: {
	source: WritableSignal<number>;
	log: (entry: string) => void;
	stopRef: { current: () => void };
}) @{
	const stop = useSignalScope(() => {
		createEffect(() => props.log('scope:' + props.source()));
	});
	// Cancel before commit so the scoped effect never starts.
	stop();
	props.stopRef.current = stop;

	<p id="sync-stop-probe">ready</p>
}

export function EffectCounter(props: {
	source: WritableSignal<number>;
	onEffect: () => void;
	onCleanup?: () => void;
}) @{
	useSignalEffect(() => {
		props.source();
		props.onEffect();
		return props.onCleanup;
	});
	<p id="effect-counter">ready</p>
}

export function EffectAndSignal(props: {
	source: WritableSignal<number>;
	onEffect: () => void;
	record: (setter: (value: number | ((previous: number) => number)) => void) => void;
}) @{
	useSignalEffect(() => {
		props.source();
		props.onEffect();
	});
	const [value, setValue] = useSignal(props.source);
	props.record(setValue);
	<div>
		<p id="value">{value as string}</p>
		<button id="set1" onClick={() => setValue(1)}>set1</button>
		<button id="set2" onClick={() => setValue(2)}>set2</button>
		<button id="set3" onClick={() => setValue(3)}>set3</button>
		<button id="set4" onClick={() => setValue(4)}>set4</button>
	</div>
}

export function SubscriptionBundle(props: {
	source: WritableSignal<number>;
	onEffect: () => void;
}) @{
	useSignal(props.source);
	useComputed(() => props.source() * 2, []);
	useSignalEffect(() => {
		props.source();
		props.onEffect();
	});
	<p id="bundle">ready</p>
}

export function LifecycleEffects(props: {
	source: WritableSignal<number>;
	log: (entry: string) => void;
	onStop: (stop: () => void) => void;
}) @{
	useSignalEffect(() => {
		props.log('effect:' + props.source());
		return () => props.log('cleanup');
	});

	const stop = useSignalScope(() => {
		createEffect(() => props.log('scope-a:' + props.source()));
		createEffect(() => props.log('scope-b:' + props.source()));
	});
	props.onStop(stop);

	<p id="lifecycle">ready</p>
}

export function ServerSignalView(props: {
	source: WritableSignal<number>;
	log: (entry: string) => void;
}) @{
	const value = useSignalValue(props.source);
	useSignalEffect(() => props.log('effect'));
	useSignalScope(() => props.log('scope'));
	<p id="server-signal">{value as string}</p>
}

export function SelectedReader(props: {
	source: ReadableSignal<{ selected: number; unrelated: number }>;
	selector: (value: { selected: number; unrelated: number }) => number;
	observe: (value: number) => void;
}) @{
	const value = useSignalSelector(props.source, props.selector);
	props.observe(value);
	<output id="selected">{value as string}</output>
}

export function DeferredReader(props: { source: ReadableSignal<number> }) @{
	const current = useSignalValue(props.source);
	const deferred = useDeferredSignalValue(props.source);
	<div>
		<output id="current">{current as string}</output>
		<output id="deferred">{deferred as string}</output>
	</div>
}

export function PhasedEffects(props: {
	signals: readonly ReadableSignal<number>[];
	log: (entry: string) => void;
}) @{
	useSignalInsertionEffect(props.signals, () => {
		const value = props.signals[0]();
		props.log(`insertion:${value}`);
		return () => props.log(`insertion-cleanup:${value}`);
	});
	useSignalLayoutEffect(props.signals, () => {
		const value = props.signals[0]();
		props.log(`layout:${value}`);
		return () => props.log(`layout-cleanup:${value}`);
	});
	useSignalPassiveEffect(props.signals, () => {
		const value = props.signals[0]();
		props.log(`passive:${value}`);
		return () => props.log(`passive-cleanup:${value}`);
	});
	<div>phased effects</div>
}

export function CleanupScope(props: {
	source: ReadableSignal<number>;
	onCleanup: () => void;
	onStop: (stop: () => void) => void;
}) @{
	const stop = useSignalScope(() => {
		createEffect(() => {
			props.source();
			return props.onCleanup;
		});
	}, []);
	props.onStop(stop);
	<div>scope</div>
}

export function EffectDependencies(props: {
	source: ReadableSignal<number>;
	label: string;
	version: number;
	log: (entry: string) => void;
}) @{
	useSignalEffect(() => {
		const label = props.label;
		const value = props.source();
		props.log(`${label}:${value}`);
		return () => props.log(`${label}:cleanup:${value}`);
	}, [props.version]);
	<div>dependencies</div>
}

export function FunctionValueReader(props: {
	source: WritableSignal<() => string>;
	next: () => string;
}) @{
	const [value, setValue] = useSignal(props.source);
	<div>
		<output id="function-name">{value.name}</output>
		<button id="set-function" onClick={() => setValue(() => props.next)}>set function</button>
	</div>
}

export function SignalPairReader(props: {
	first: ReadableSignal<number>;
	second: ReadableSignal<number>;
	observe: (values: readonly [number, number]) => void;
}) @{
	const first = useSignalValue(props.first);
	const second = useSignalValue(props.second);
	props.observe([first, second]);
	<output>{`${first}:${second}`}</output>
}

export function ServerSignalFeatures(props: {
	source: ReadableSignal<number>;
	log: (entry: string) => void;
}) @{
	const signals = useMemo(() => [props.source], [props.source]);
	const value = useSignalValue(props.source);
	const selected = useSignalSelector(props.source, (current) => current * 2);
	const deferred = useDeferredSignalValue(props.source);
	useSignalInsertionEffect(signals, () => {
		props.log('insertion:' + props.source());
		return () => props.log('insertion:cleanup');
	}, []);
	useSignalLayoutEffect(signals, () => {
		props.log('layout:' + props.source());
		return () => props.log('layout:cleanup');
	}, []);
	useSignalPassiveEffect(signals, () => {
		props.log('passive:' + props.source());
		return () => props.log('passive:cleanup');
	}, []);
	<div id="server-features">
		<output id="current">{value as string}</output>
		<output id="selected">{selected as string}</output>
		<output id="deferred">{deferred as string}</output>
	</div>
}
