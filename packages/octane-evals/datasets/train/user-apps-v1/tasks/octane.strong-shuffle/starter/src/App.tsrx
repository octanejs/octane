'use strong';
import { useState } from 'octane';

const ANSWERS = ['Red', 'Green', 'Blue', 'Yellow'];

export function App() @{
	const [picked, setPicked] = useState('');
	const [round, setRound] = useState(0);
	const order = ANSWERS.toSorted(() => Math.random() - 0.5);

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
