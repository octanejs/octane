import { useEffect, useState } from 'octane';

export function Ticker() @{
	const [count, setCount] = useState(0);
	useEffect(() => {
		const tick$ = setInterval(() => setCount((value) => value + 1), 1000);
		return () => clearInterval(tick$);
	}, []);
	<div>{String(count)}</div>
}
