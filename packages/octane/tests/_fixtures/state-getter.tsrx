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
	<button id="state" onClick={update}>
		{count as string}
	</button>
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
	<button id="reducer" onClick={update}>
		{count as string}
	</button>
}

export function ServerGetter() @{
	const [count, setCount, getCount] = useState(0);
	if (count < 2) setCount(count + 1);
	<span>
		{'Count: ' + getCount()}
	</span>
}
