import { useState } from 'octane';
import { OverlayScrollbarsComponent } from '../../src/index.ts';

export function DynamicChildren() {
	const [elements, setElements] = useState(1);
	const items: number[] = [];
	for (let i = 0; i < Math.max(elements, 0); i++) {
		items.push(i);
	}

	function add() {
		setElements(function next(curr: number) {
			return curr + 1;
		});
	}

	function remove() {
		setElements(function next(curr: number) {
			return curr - 1;
		});
	}

	return <div>
		<OverlayScrollbarsComponent>
			@if (elements === 0) {
				<span>empty</span>
			}
			@for (const i of items; key i) {
				<span>{String(i)}</span>
			}
		</OverlayScrollbarsComponent>
		<button onClick={add}>add</button>
		<button onClick={remove}>remove</button>
	</div>;
}
