import { StrictMode, useState } from 'octane';
import {
	createEffect,
	type ReadableSignal,
	type SignalEffectDependencies,
	type WritableSignal,
	useComputed,
	useDeferredSignalValue,
	useSetSignal,
	useSignal,
	useSignalEffect,
	useSignalInsertionEffect,
	useSignalLayoutEffect,
	useSignalPassiveEffect,
	useSignalScope,
	useSignalSelector,
	useSignalValue,
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
		<button id="increment" onClick={() => setLeft((value) => value + 1)}>
			increment
		</button>
		<button id="set" onClick={() => setLeftOnly(10)}>
			set
		</button>
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
		<button id="set" onClick={() => setValue(10)}>
			set
		</button>
		<button id="inc" onClick={() => setValue((previous) => previous + 1)}>
			inc
		</button>
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
		<button id="set" onClick={() => setValue(10)}>
			set
		</button>
		<button id="inc" onClick={() => setValue((previous) => previous + 5)}>
			inc
		</button>
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
		<button id="switch" onClick={() => setSecond(true)}>
			switch
		</button>
	</div>
}

export function ComputedReader(props: { source: WritableSignal<number>; multiplier: number }) @{
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
		<button id="rerender" onClick={() => setRender((value) => value + 1)}>
			rerender
		</button>
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
		<button id="undef" onClick={() => setValue(undefined)}>
			undef
		</button>
		<button id="null" onClick={() => setValue(null)}>
			null
		</button>
	</div>
}

export function ObjectSignalReader(props: { source: WritableSignal<{ a: number; b: number }> }) @{
	const [value, setValue] = useSignal(props.source);
	<div>
		<p id="value">{JSON.stringify(value)}</p>
		<button id="set" onClick={() => setValue({ a: 2, b: 2 })}>
			set
		</button>
	</div>
}

export function SetterProbe(props: {
	source: WritableSignal<number>;
	record: (setter: (value: number | ((previous: number) => number)) => void) => void;
}) @{
	const [, setValue] = useSignal(props.source);
	const [, setRender] = useState(0);
	props.record(setValue);

	<button id="rerender" onClick={() => setRender((value) => value + 1)}>
		rerender
	</button>
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
		<button id="set1" onClick={() => setValue(1)}>
			set1
		</button>
		<button id="set2" onClick={() => setValue(2)}>
			set2
		</button>
		<button id="set3" onClick={() => setValue(3)}>
			set3
		</button>
		<button id="set4" onClick={() => setValue(4)}>
			set4
		</button>
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

export function DependencyListEffects(props: {
	source: WritableSignal<number>;
	signals: SignalEffectDependencies;
	label: string;
	log: (entry: string) => void;
}) @{
	useSignalEffect(() => {
		props.log('effect:' + props.label + ':' + props.source());
		return () => props.log('effect-cleanup:' + props.label);
	}, [props.label]);
	useSignalScope(() => {
		createEffect(() => props.log('scope:' + props.label + ':' + props.source()));
	}, [props.label]);
	useSignalLayoutEffect(
		props.signals,
		() => {
			props.log('layout:' + props.label);
		},
		[props.label],
	);
	<p id="dependency-list-effects">ready</p>
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

export function BatchedReaders(props: {
	first: WritableSignal<number>;
	second: WritableSignal<number>;
	onRender: () => void;
}) @{
	props.onRender();
	const first = useSignalValue(props.first);
	const second = useSignalValue(props.second);
	<p id="values">{JSON.stringify([first, second])}</p>
}

export function SelectorReader(props: {
	source: WritableSignal<{ selected: number; unrelated: number }>;
	select: (value: { selected: number; unrelated: number }) => number;
	onRender: () => void;
}) @{
	props.onRender();
	const selected = useSignalSelector(props.source, props.select);
	<p id="selected">{String(selected)}</p>
}

export function StrictSignalValueReader(props: { source: WritableSignal<number> }) @{
	<StrictMode>
		<SignalValueReader source={props.source} />
	</StrictMode>
}

export function DeferredReader(props: { source: WritableSignal<number> }) @{
	const current = useSignalValue(props.source);
	const deferred = useDeferredSignalValue(props.source);
	<div>
		<p id="current">{String(current)}</p>
		<p id="deferred">{String(deferred)}</p>
	</div>
}

export function PhasedSignalEffects(props: {
	dependencies: SignalEffectDependencies;
	log: (entry: string) => void;
}) @{
	useSignalInsertionEffect(props.dependencies, () => {
		props.log('insertion');
	});
	useSignalLayoutEffect(props.dependencies, () => {
		props.log('layout');
	});
	useSignalPassiveEffect(props.dependencies, () => {
		props.log('passive');
	});
	<p id="phased">ready</p>
}

export function ManualStopScope(props: {
	source: WritableSignal<number>;
	cleanupEffect: () => void;
	onStop: (stop: () => void) => void;
}) @{
	const stop = useSignalScope(() => {
		createEffect(() => {
			props.source();
			return props.cleanupEffect;
		});
	}, []);
	props.onStop(stop);

	<p id="manual-stop">ready</p>
}

export function ServerScopeProbe(props: { callback: () => void }) @{
	useSignalScope(props.callback, []);
	<p id="server-scope">ready</p>
}
