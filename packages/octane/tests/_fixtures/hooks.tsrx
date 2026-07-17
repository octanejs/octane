import {
	useState as octaneUseState,
	useReducer,
	useEffect,
	useLayoutEffect,
	useInsertionEffect,
	useMemo as octaneUseMemo,
	useCallback,
	useRef as octaneUseRef,
} from 'octane';

// Lazy initial value
export function LazyInit() @{
	const [n, setN] = octaneUseState(() => 41 + 1);
	<span>
		{n as string}
	</span>
}

// Two independent useState slots
export function TwoStates() @{
	const [a, setA] = octaneUseState(1);
	const [b, setB] = octaneUseState(10);
	<div>
		<button id="a" onClick={() => setA(a + 1)}>
			{a as string}
		</button>
		<button id="b" onClick={() => setB(b + 2)}>
			{b as string}
		</button>
	</div>
}

// useReducer
export function Tally() @{
	const [n, dispatch] = useReducer((s, a) => s + a, 0);
	<button onClick={() => dispatch(5)}>
		{n as string}
	</button>
}

// useMemo — recompute only when deps change.
// useRef(N) returns { current: N } — the runtime wraps.
export function MemoTest(props) @{
	const computeCount = octaneUseRef(0);
	const doubled = octaneUseMemo(() => {
		computeCount.current++;
		return props.n * 2;
	});
	<div>
		<span class="val">
			{doubled as string}
		</span>
		<span class="count">
			{computeCount.current as string}
		</span>
	</div>
}

function useComputed(factory, dependencies) {
	return octaneUseMemo(factory, dependencies);
}

export function CustomMemoDeps(props) @{
	const value = useComputed(() => props.compute(props.value));
	<div>
		<span class="value">
			{value as string}
		</span>
		<span class="noise">
			{props.noise as string}
		</span>
	</div>
}

export function CustomMemoPair(props) @{
	const first = useComputed(() => 'A' + props.value);
	const second = useComputed(() => 'B' + props.value);
	<span>
		{first + '/' + second}
	</span>
}

export function CastCustomMemoPair(props) @{
	const first = (useComputed as typeof useComputed)(() => 'A' + props.value);
	const second = (useComputed as typeof useComputed)(() => 'B' + props.value);
	<span>
		{first + '/' + second}
	</span>
}

function useMemo(callback, options) {
	return Array.isArray(options) ? 'unexpected dependencies' : callback();
}

export function BuiltinLookalike(props) @{
	const value = useMemo(() => props.value);
	<span>
		{value as string}
	</span>
}

function useState(value) {
	return [value, () => value];
}

function useRef(value) {
	return { current: value };
}

export function StableResultLookalikes(props) @{
	const [, read] = useState(props.value);
	const ref = useRef(props.value);
	const value = useComputed(() => read() + '/' + ref.current);
	<span>
		{value as string}
	</span>
}

function useSelectorLike(selector, equality) {
	return Array.isArray(equality) ? 'unexpected dependencies' : selector();
}

export function CustomSelectorCallback(props) @{
	const value = useSelectorLike(() => props.value);
	<span>
		{value as string}
	</span>
}

// useCallback — stable identity per deps
export function CbTest(props) @{
	const cb = useCallback(() => props.label);
	<span>
		{props.label as string}
	</span>
}

// useRef — survives across renders, mutations don't trigger re-render.
export function RefTest() @{
	const ref = octaneUseRef(0);
	const [tick, setTick] = octaneUseState(0);
	<button
		onClick={() => {
			ref.current++;
			setTick(tick + 1);
		}}
	>
		{ref.current as string}
	</button>
}

// useEffect — fires after commit; cleanup on unmount
export function EffectMount(props) @{
	useEffect(() => {
		props.onMount();
		return () => {
			props.onUnmount();
		};
	});
	<div>{'mounted'}</div>
}

// useEffect with deps — re-fires when deps change
export function EffectDeps(props) @{
	useEffect(() => {
		props.cb(props.n);
	});
	<span>
		{props.n as string}
	</span>
}

function useObservedEffect(callback, dependencies) {
	useEffect(callback, dependencies);
}

export function CustomEffectDeps(props) @{
	useObservedEffect(() => props.cb(props.value));
	<span>
		{props.noise as string}
	</span>
}

// useLayoutEffect runs synchronously (before passive useEffect)
export function LayoutVsEffect(props) @{
	useEffect(() => {
		props.order.push('e');
	});
	useLayoutEffect(() => {
		props.order.push('l');
	});
	useInsertionEffect(() => {
		props.order.push('i');
	});
	<div>{'x'}</div>
}

// `null` is the explicit every-render escape hatch now that omission means
// compiler-inferred dependencies.
export function EffectAlways(props) @{
	useEffect(() => props.cb(props.n), null);
	<span>
		{props.n as string}
	</span>
}
