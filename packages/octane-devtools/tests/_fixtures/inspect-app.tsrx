import { useDebugValue, useEffect, useState } from 'octane';

export const formatCalls: { count: number } = { count: 0 };

function useCounter(step: number): [number, () => void] {
	const [count, setCount] = useState(0);
	useDebugValue(count, (value: number) => {
		formatCalls.count++;
		return 'count is ' + value;
	});
	return [count, () => setCount(count + step)];
}

export function Counter(props: { step: number }) @{
	const [count, increment] = useCounter(props.step);
	useEffect(() => {
		return () => {};
	}, []);
	<button class="inc" onClick={increment}>
		{'count: ' + count}
	</button>
}

export function Gated() @{
	const [on, setOn] = useState(true);
	if (on) useCounter(1);
	<button class="gate" onClick={() => setOn(false)}>
		{'on: ' + on}
	</button>
}

export function App() @{
	const [items] = useState(['alpha', 'beta']);
	<main>
		<Counter step={2} />
		<ul>
			@for (const item of items; key item) {
				<li>{item}</li>
			}
		</ul>
	</main>
}
