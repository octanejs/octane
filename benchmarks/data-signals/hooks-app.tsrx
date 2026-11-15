import { memo } from 'octane';
import { useDataStore, useRead } from 'octane/data/octane';
import { item, items, type Item } from './data.ts';
import { counts, type RowProps, type Slot } from './shared.ts';

function OwnRow(props: RowProps) @{
	counts.renders++;
	const value: Item = useRead(useDataStore().read(item, { id: props.id }));
	<li>{value.label as string}</li>
}

function Card(props: RowProps) @{
	counts.renders++;
	const store = useDataStore();
	const a: Item = useRead(store.read(item, { id: props.ids[0]! }));
	const b: Item = useRead(store.read(item, { id: props.ids[1]! }));
	const c: Item = useRead(store.read(item, { id: props.ids[2]! }));
	const d: Item = useRead(store.read(item, { id: props.ids[3]! }));
	<li>
		<b>{a.label as string}</b>
		<i>{b.label as string}</i>
		<i>{c.label as string}</i>
		<i>{d.label as string}</i>
	</li>
}

function FieldRow(props: RowProps) @{
	counts.renders++;
	const list: Item[] = useRead(useDataStore().read(items));
	<li>{list[props.index]!.label as string}</li>
}

function NoData(props: RowProps) @{
	counts.renders++;
	<li>{props.id as string}</li>
}

function ItemRowImpl(props: { item: Item; tick: number }) @{
	counts.renders++;
	<li>{props.item.label as string}</li>
}
const ItemRow = memo(ItemRowImpl);

/** `hooks-list`: one read of the list, and a memoized row per entry. */
export function FieldList(props: { slots: readonly Slot[]; tick: number }) @{
	const list: Item[] = useRead(useDataStore().read(items));
	<ul>
		@for (const row of list; key row.id) {
			<ItemRow item={row} tick={props.tick} />
		}
	</ul>
}

export const rows = { rows: OwnRow, stream: OwnRow, multi: Card, field: FieldRow, none: NoData };
