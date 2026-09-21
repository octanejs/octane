import { useState } from 'react';
import Row from './Row.jsx';
import { bindHandlers, initialItems } from './ops.js';

// React 19 parent — same keyed 1k-row table + `tick` state as the octane
// apps. tick is passed into every Row as a real prop, so bumping it
// re-invokes all 1000 row bodies (the React Compiler element cache cannot
// skip a props change) with all effect deps unchanged: the update_nodeps
// measurement.

export default function App() {
	const [items, setItems] = useState(initialItems());
	const [tick, setTick] = useState(0);
	bindHandlers({ setItems, setTick });

	return (
		<div>
			<div className="tick">{tick}</div>
			<table className="test-data">
				<tbody>
					{items.map((item) => (
						<Row key={item.id} item={item} tick={tick} />
					))}
				</tbody>
			</table>
		</div>
	);
}
