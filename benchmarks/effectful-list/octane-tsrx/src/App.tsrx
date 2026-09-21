import { useState } from 'octane';
import Row from './Row.tsrx';
import { bindHandlers, initialItems } from './ops.js';

// effectful-list parent: a keyed 1k-row table of cross-module <Row/>
// components plus a `tick` state threaded into every Row as a real prop.
// Bumping tick changes each row's props, so no equal-props bail can skip the
// 1,000 body re-invocations — with every effect deps-array unchanged — which
// is exactly the update_nodeps measurement.

export default function App() @{
	const [items, setItems] = useState(initialItems());
	const [tick, setTick] = useState(0);
	bindHandlers({ setItems, setTick });

	<div>
		<div class="tick">{tick as string}</div>
		<table class="test-data">
			<tbody>
				@for (const item of items; key item.id) {
					<Row item={item} tick={tick} />
				}
			</tbody>
		</table>
	</div>
}
