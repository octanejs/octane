export function AtBraceCount() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>
		{count as string}
	</button>
}
