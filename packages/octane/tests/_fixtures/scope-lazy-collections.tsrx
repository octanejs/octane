import { useState } from 'octane';

// A leaf that registers a ref (so its scope lazily allocates `cleanups` for the detach) and no
// child scopes.
function Leaf(props) @{
	<span class="leaf" ref={props.collect} />
}

// A middle layer with no ref of its own: its scope only ever allocates `children`.
function Branch(props) @{
	<div class="branch">
		<Leaf collect={props.collect} />
		<Leaf collect={props.collect} />
	</div>
}

// Unmounting the root has to walk the lazily-allocated `children` of every level to reach the
// leaves' lazily-allocated `cleanups`.
export function NestedRefs(props) @{
	const [shown, setShown, getShown] = useState(true);
	<div>
		<button class="toggle" onClick={() => setShown(!getShown())}>t</button>
		@if (shown) {
			<Branch collect={props.collect} />
		}
	</div>
}

// A keyed list of pure host rows carrying refs — the de-opt clear path checks whether an item
// scope holds any teardown state before unmounting it.
export function RefRows(props) @{
	const [items, setItems, getItems] = useState(() => [{ id: 1 }, { id: 2 }, { id: 3 }]);
	<div>
		<button class="clear" onClick={() => setItems([])}>clear</button>
		@for (const it of items; key it.id) {
			<span class="row" ref={props.collect} />
		}
	</div>
}
