import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'octane';
import { useExternalEffect, useExternalMemo } from './auto-hook-deps-external.ts';

export function EffectFromProps(props) @{
	useEffect(() => {
		props.log(`run:${props.value}`);
		return () => props.log(`cleanup:${props.value}`);
	});
	<span>{props.noise as string}</span>
}

export function EffectFromState(props) @{
	const [value, setValue] = useState(0);
	const [noise, setNoise] = useState(0);
	useEffect(() => {
		props.log(`run:${value}`);
		return () => props.log(`cleanup:${value}`);
	});
	<div>
		<button class="value" onClick={() => setValue(value + 1)}>{value as string}</button>
		<button class="noise" onClick={() => setNoise(noise + 1)}>{noise as string}</button>
	</div>
}

export function EffectFromDerivedValue(props) @{
	const selected = props.items[props.index]?.label ?? 'none';
	useEffect(() => props.log(`${props.prefix}:${selected}`));
	<span>{props.noise as string}</span>
}

export function CaptureFreeEffect() @{
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const root = document.documentElement;
		root.dataset.autoDepsRuns = String(Number(root.dataset.autoDepsRuns ?? 0) + 1);
		return () => {
			root.dataset.autoDepsCleanups = String(Number(root.dataset.autoDepsCleanups ?? 0) + 1);
		};
	});
	<button onClick={() => setTick(tick + 1)}>{tick as string}</button>
}

export function EffectFromReferencedCallback(props) @{
	useEffect(props.effect);
	<span>{props.noise as string}</span>
}

export function EffectWithStableHookResults(props) @{
	const [tick, setTick] = useState(0);
	const ref = useRef(props.seed);
	useEffect(() => props.observe(ref.current, setTick));
	<button onClick={() => setTick(tick + 1)}>{tick as string}</button>
}

export function EffectFromCleanupOnly(props) @{
	useEffect(() => {
		props.connect();
		return () => props.disconnect(props.value);
	});
	<span>{props.noise as string}</span>
}

export function EffectFromDeferredWork(props) @{
	useEffect(() => {
		let active = true;
		props.task.then(() => {
			if (active) props.log(props.value);
		});
		return () => {
			active = false;
			props.cleanup(props.value);
		};
	});
	<span>{props.noise as string}</span>
}

export function EffectFromDestructuring(props) @{
	useEffect(() => {
		const { [props.field]: selected = props.fallback } = props.record;
		props.log(selected);
	});
	<span>{props.noise as string}</span>
}

export function EffectWithConvergingUpdate(props) @{
	const [value, setValue] = useState(0);
	useEffect(() => {
		props.log(value);
		if (value < props.target) setValue((current) => current + 1);
	});
	<span class="value">{value as string}</span>
}

export function EffectWithFreshFunction(props) @{
	const notify = () => props.log(props.value);
	useEffect(() => notify());
	<span>{props.noise as string}</span>
}

export function EffectWithFreshObject(props) @{
	const options = { value: props.value };
	useEffect(() => props.log(options));
	<span>{props.noise as string}</span>
}

export function MemoFromProps(props) @{
	const value = useMemo(() => props.compute(props.value));
	<div>
		<span class="value">{value as string}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

export function MemoFromState(props) @{
	const [value, setValue] = useState(1);
	const [noise, setNoise] = useState(0);
	const computed = useMemo(() => props.compute(value));
	<div>
		<span class="computed">{computed as string}</span>
		<button class="value" onClick={() => setValue(value + 1)}>{value as string}</button>
		<button class="noise" onClick={() => setNoise(noise + 1)}>{noise as string}</button>
	</div>
}

export function MemoFromOptionalPath(props) @{
	const value = useMemo(() => props.user?.profile?.name ?? 'anonymous');
	<div>
		<span class="value">{value}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

export function MemoFromComputedPath(props) @{
	const value = useMemo(() => props.items[props.index]?.label ?? 'none');
	<div>
		<span class="value">{value}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

export function MemoWithManyDependencies(props) @{
	const value = useMemo(() => props.compute(props.a, props.b, props.c, props.d, props.e));
	<div>
		<span class="value">{value as string}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

export function CaptureFreeMemo() @{
	const [tick, setTick] = useState(0);
	const value = useMemo(() => ({ token: 'stable' }));
	const first = useRef(value);
	<div>
		<span class="identity">
			{first.current === value ? 'same' : 'changed'}
		</span>
		<button onClick={() => setTick(tick + 1)}>{tick as string}</button>
	</div>
}

export function MemoFromReferencedFactory(props) @{
	const value = useMemo(props.factory);
	<div>
		<span class="value">{value as string}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

export function MemoFromNestedScope(props) @{
	const value = useMemo(() => {
		function format(suffix = props.suffix) {
			return props.value + suffix;
		}
		return format();
	});
	<div>
		<span class="value">{value}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

export function ObjectIsDependencies(props) @{
	useEffect(() => props.effect(props.value));
	const value = useMemo(() => props.compute(props.value));
	<div>
		<span class="value">{value as string}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

export function ExternalHookDependencies(props) @{
	useExternalEffect(props.value, props.log);
	const value = useExternalMemo(props.value, props.compute);
	<div>
		<span class="value">{value}</span>
		<span class="noise">{props.noise as string}</span>
	</div>
}

function useTestStore(store) {
	return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export function StoreSetterEffect(props) @{
	const store = useTestStore(props.store);
	useEffect(() => {
		props.onEffect();
		if (props.enabled) store.setState(props.next);
	});
	<span class="value">{store.xxx}</span>
}

export function StoreFieldEffect(props) @{
	const store = useTestStore(props.store);
	useEffect(() => props.log(store.xxx));
	<span class="value">{store.xxx}</span>
}

export function StoreGetterInsideEffect(props) @{
	const store = useTestStore(props.store);
	useEffect(() => props.log(store.getValue('xxx')));
	<span class="value">{store.xxx}</span>
}

export function StoreGetterSelectedEffect(props) @{
	const store = useTestStore(props.store);
	const value = store.getValue('xxx');
	useEffect(() => props.log(value));
	<span class="value">{value}</span>
}
