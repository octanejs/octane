import { useState } from 'octane';

// SSR Phase 6 (M2) — @for hydration. The server wraps the whole @for in a
// `<!--[-->…<!--]-->` range. Each proven direct-host item self-delimits via its
// <li>, so the server emits no per-item pairs; the client adopts those roots as
// keyed boundaries instead of cloning fresh or creating markers.

type ListItem = {
	id: number;
	name: string;
};

export function List(props: { items: ListItem[]; onPick: (id: number) => void }) @{
	<ul id="list">
		@for (const item of props.items; key item.id) {
			<li class="row">
				<span class="name">{item.name as string}</span>
				<button class="pick" onClick={() => props.onPick(item.id)}>{'pick'}</button>
			</li>
		}
	</ul>
}

export function IndexedList(props: { items: ListItem[] }) @{
	<ul id="indexed-list">
		@for (const item of props.items; index i; key i) {
			<li class="indexed-row" data-index={i}>
				<span class="name">{item.name as string}</span>
			</li>
		}
	</ul>
}

type ComponentRowData = {
	id: string;
	name: string;
};

type ComponentListProps = {
	items: ComponentRowData[];
	onPick: (id: string) => void;
};

function ComponentRow(props: { item: ComponentRowData; onPick: (id: string) => void }) @{
	const [count, setCount] = useState(0);
	<li class="component-row" data-id={props.item.id}>
		<button
			class="component-pick"
			onClick={() => {
				setCount(count + 1);
				props.onPick(props.item.id);
			}}
		>
			{props.item.name + ':' + count}
		</button>
	</li>
}

export function ComponentList(props: ComponentListProps) @{
	<ul id="component-list">
		@for (const item of props.items; key item.id) {
			<ComponentRow item={item} onPick={props.onPick} />
		} @empty {
			<li class="component-empty">No items</li>
		}
		<li class="component-tail">Tail</li>
	</ul>
}

export function ExplicitKeyComponentList(props: ComponentListProps) @{
	<ul id="explicit-key-component-list">
		@for (const item of props.items; key item.id) {
			<ComponentRow key={item.id} item={item} onPick={props.onPick} />
		}
	</ul>
}
