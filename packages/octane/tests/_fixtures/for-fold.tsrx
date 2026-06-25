import { useState } from 'octane';

// return-JSX host element containing `@for` (+ `@empty`) — folds to the
// return-based fragment model. The item/empty bodies stay in the component
// (closure); `items` + the body functions thread as `props.hN` holes; the key fn
// is module-hoisted, so it stays a bare reference.
export function RetList(props) {
	return <ul>
		@for (const item of props.items; key item.id) {
			<li>
				{item.title as string}
			</li>
		} @empty {
			<li class="empty">none</li>
		}
	</ul>;
}

// `@{}` oracle — must produce byte-identical DOM (and reconcile identically).
export function AtList(props) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<li>
				{item.title as string}
			</li>
		} @empty {
			<li class="empty">none</li>
		}
	</ul>
}

// Stateful: exercises keyed reconciliation through the fold on re-render.
export function RetListApp() {
	const [items, setItems] = useState([
		{ id: 1, title: 'a' },
	]);
	return <div>
		<button onClick={() => setItems([...items, { id: items.length + 1, title: 'x' }])}>
			add
		</button>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					{item.title as string}
				</li>
			}
		</ul>
	</div>;
}
