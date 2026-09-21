import { useState } from 'octane';
import Row from './Row.tsx';
import { bindHandlers, initialItems } from './ops.js';

// JSX twin of octane-tsrx's App.tsrx — same keyed 1k-row table over the same
// octane core, authored React-style (`{items.map(... key=)}`, `className`).
// The `tick` state drives update_nodeps and is passed into every Row as a
// real prop, so all 1,000 bodies re-invoke on the bump while every effect
// deps-array stays unchanged.

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
