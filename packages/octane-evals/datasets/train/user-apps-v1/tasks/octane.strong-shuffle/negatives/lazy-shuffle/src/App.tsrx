'use strong';
// Workaround: shuffle once in a lazy state initializer.
import { useState } from 'octane';

const ANSWERS = ['Red', 'Green', 'Blue', 'Yellow'];

export function App() @{
	const [picked, setPicked] = useState('');
	const [order, setOrder] = useState(() => ANSWERS.toSorted(() => Math.random() - 0.5));

	<section>
		<ol>
			@for (const answer of order; key answer) {
				<li>
					<button aria-pressed={picked === answer} onClick={() => setPicked(answer)}>
						{answer as string}
					</button>
				</li>
			}
		</ol>
		<button onClick={() => setOrder(order.toSorted(() => Math.random() - 0.5))}>{'Shuffle'}</button>
	</section>
}
