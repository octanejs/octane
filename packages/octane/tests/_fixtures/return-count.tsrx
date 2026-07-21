export function Count() {
	const [count, setCount] = useState(0);
	return <button onClick={() => setCount(count + 1)}>{count as string}</button>;
}
