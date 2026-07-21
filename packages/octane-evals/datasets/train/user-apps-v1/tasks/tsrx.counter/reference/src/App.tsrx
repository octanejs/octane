import { useState } from 'octane';

export function App() @{
	const [count, setCount] = useState(0);

	<main>
		<h1>{'Seat selector'}</h1>
		<div role="group" aria-label="Seats">
			<button
				aria-label="Remove seat"
				disabled={count === 0}
				onClick={() => setCount(Math.max(0, count - 1))}
			>{'−'}</button>
			<output aria-label="Seat count">{count as string}</output>
			<button
				aria-label="Add seat"
				disabled={count === 3}
				onClick={() => setCount(Math.min(3, count + 1))}
			>{'+'}</button>
		</div>
		@if (count === 0) {
			<p role="status">{'No seats selected'}</p>
		} @else if (count === 3) {
			<p role="status">{'Selection full'}</p>
		} @else {
			<p role="status">{'Ready to reserve'}</p>
		}
	</main>
}
