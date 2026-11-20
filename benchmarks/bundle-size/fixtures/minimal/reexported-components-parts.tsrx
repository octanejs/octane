import { useState } from 'octane';

export function Badge(props: { label: string }) @{
	<em>{props.label as string}</em>
}

export function Counter(props: { start: number }) @{
	const [count, setCount] = useState(props.start);
	<button onClick={() => setCount(count + 1)}>{String(count) as string}</button>
}
