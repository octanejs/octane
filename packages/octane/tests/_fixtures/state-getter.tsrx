import { useReducer, useState } from 'octane';

export function StateGetter(props) @{
	const [count, setCount, getCount] = useState(props.initial);
	props.observeGetter(getCount);
	const update = () => {
		setCount((n) => n + 1);
		props.observeValue(getCount());
		setCount((n) => n + 1);
		props.observeValue(getCount());
	};
	<button id="state" onClick={update}>{count as string}</button>
}

export function ReducerGetter(props) @{
	const [count, dispatch, getCount] = useReducer(
		(state: number, amount: number) => state + amount * props.step,
		props.initial,
		(seed: number) => seed * 10,
	);
	props.observeGetter(getCount);
	const update = () => {
		dispatch(2);
		props.observeValue(getCount());
	};
	<button id="reducer" onClick={update}>{count as string}</button>
}

export function RenderPhaseNullableReducerGetter(props) @{
	const [value, dispatch, getValue] = useReducer((state: any, action: string) => {
		if (action === 'empty') return props.empty;
		if (state === null) return 'saw:null';
		if (state === undefined) return 'saw:undefined';
		return 'saw:' + state;
	}, 'seed');
	if (value === 'seed') {
		dispatch('empty');
		props.observe(getValue());
		dispatch('describe');
		props.observe(getValue());
	}
	<span id="nullable-reducer">{String(value)}</span>
}

export function ServerGetter() @{
	const [count, setCount, getCount] = useState(0);
	if (count < 2) setCount(count + 1);
	<span>{'Count: ' + getCount()}</span>
}

function useIndependentCounters(initial, step) {
	const state = useState(() => initial);
	const reducer = useReducer((value, amount) => value + amount * step, initial);
	return { state, reducer };
}

export function ConditionalGetters(props) @{
	let first;
	if (props.visible) first = useIndependentCounters(10, props.step);
	const second = useIndependentCounters(20, props.step);
	props.bind({ first, second });
	<output>
		{(first ? first.state[0] + ':' + first.reducer[0] : 'hidden') + '|' + second.state[0] + ':' +
			second.reducer[0]}
	</output>
}
