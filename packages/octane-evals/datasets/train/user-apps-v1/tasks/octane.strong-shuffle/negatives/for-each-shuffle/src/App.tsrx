'use strong';
// Workaround: hand-written Fisher-Yates inside forEach during render.
import { useState } from 'octane';

const ANSWERS = ['Red', 'Green', 'Blue', 'Yellow'];

export function App() @{
	const [picked, setPicked] = useState('');
	const [round, setRound] = useState(0);
	const order = [...ANSWERS];
	order.forEach((_, index) => {
		const other = Math.floor(Math.random() * (index + 1));
		[order[index], order[other]] = [order[other], order[index]];
	});

	<section data-round={round}>
		<ol>
			@for (const answer of order; key answer) {
				<li>
					<button aria-pressed={picked === answer} onClick={() => setPicked(answer)}>
						{answer as string}
					</button>
				</li>
			}
		</ol>
		<button onClick={() => setRound(round + 1)}>{'Shuffle'}</button>
	</section>
}
