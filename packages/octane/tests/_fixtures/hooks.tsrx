import {
	useState,
	useReducer,
	useEffect,
	useLayoutEffect,
	useInsertionEffect,
	useMemo,
	useCallback,
	useRef,
} from 'octane';

// Lazy initial value
export function LazyInit() @{
	const [n, setN] = useState(() => 41 + 1);
	<span>
		{n as string}
	</span>
}

// Two independent useState slots
export function TwoStates() @{
	const [a, setA] = useState(1);
	const [b, setB] = useState(10);
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
	const computeCount = useRef(0);
	const doubled = useMemo(() => {
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

// useCallback — stable identity per deps
export function CbTest(props) @{
	const cb = useCallback(() => props.label);
	<span>
		{props.label as string}
	</span>
}

// useRef — survives across renders, mutations don't trigger re-render.
export function RefTest() @{
	const ref = useRef(0);
	const [tick, setTick] = useState(0);
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
