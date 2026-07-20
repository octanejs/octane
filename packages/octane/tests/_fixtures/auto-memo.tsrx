import { useState } from 'octane';
import {
	AutoMemoChild,
	AutoMemoContext,
	AutoMemoCustomChild,
	AutoMemoOpaqueChild,
	AutoMemoOpaqueReturned,
	bumpAutoMemoOpaqueVersions,
} from './auto-memo-child.tsrx';

// A pure, same-module component region. Production compilation caches callers
// the whole list by the `items` capture and reuse its full Block on equal deps.
function Rows(props) @{
	<ul id="auto-memo-rows">
		@for (const item of props.items; key item.id) {
			<AutoMemoChild id={item.id} label={item.label} />
		}
	</ul>
}

// The imported child owns a custom comparator. The compiler-owned region must
// fall back, so the explicit comparator remains observable.
function CustomRows() @{
	<div id="auto-memo-custom">
		<AutoMemoCustomChild />
	</div>
}

// Imported non-memo components are opaque to this module's purity proof. The
// inferred region must fall back rather than reuse output across parent entries.
function OpaqueRows() @{
	<div id="auto-memo-opaque">
		<AutoMemoOpaqueChild />
	</div>
}

// Return-JSX components reconcile their descriptor through childSlot. The
// imported multi-root child must still make the outer candidate fall back.
function ReturnedOpaque() {
	return <AutoMemoOpaqueReturned />;
}

function ReturnedValue(props) {
	return <p id="auto-returned">{'returned ' + props.value}</p>;
}

export function AutoMemoApp() @{
	const [items, setItems] = useState([
		{ id: 1, label: 'a' },
		{ id: 2, label: 'b' },
	]);
	const [tick, setTick] = useState(0);
	const [theme, setTheme] = useState('t0');

	<div>
		<button
			id="auto-tick"
			onClick={() => {
				bumpAutoMemoOpaqueVersions();
				setTick((value) => value + 1);
			}}
		>
			{'tick ' + tick}
		</button>
		<button
			id="auto-item"
			onClick={() => setItems(
				(current) => current.map(
					(item) => (item.id === 1 ? { ...item, label: item.label + '!' } : item),
				),
			)}
		>{'item'}</button>
		<button id="auto-context" onClick={() => setTheme((value) => value + '!')}>{'context'}</button>
		<button
			id="auto-item-context"
			onClick={() => {
				setItems(
					(current) => current.map(
						(item) => (item.id === 1 ? { ...item, label: item.label + '!' } : item),
					),
				);
				setTheme((value) => value + '!');
			}}
		>{'item + context'}</button>
		<AutoMemoContext.Provider value={theme}>
			<Rows items={items} />
		</AutoMemoContext.Provider>
		<ReturnedValue value={theme} />
		<CustomRows />
		<OpaqueRows />
		<ReturnedOpaque />
	</div>
}
