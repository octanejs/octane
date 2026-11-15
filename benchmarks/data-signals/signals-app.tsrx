import { derived$ } from 'octane/signals';
import { useDataStore } from 'octane/data/octane';
import { read$ } from './cells.ts';
import { item, items } from './data.ts';
import { counts, type RowProps } from './shared.ts';

function OwnCell(props: RowProps) @{
	counts.renders++;
	const item$ = read$(useDataStore().read(item, { id: props.id }));
	<li>{item$.get().label as string}</li>
}

function CardCells(props: RowProps) @{
	counts.renders++;
	const store = useDataStore();
	const a$ = read$(store.read(item, { id: props.ids[0]! }));
	const b$ = read$(store.read(item, { id: props.ids[1]! }));
	const c$ = read$(store.read(item, { id: props.ids[2]! }));
	const d$ = read$(store.read(item, { id: props.ids[3]! }));
	<li>
		<b>{a$.get().label as string}</b>
		<i>{b$.get().label as string}</i>
		<i>{c$.get().label as string}</i>
		<i>{d$.get().label as string}</i>
	</li>
}

function FieldCell(props: RowProps) @{
	counts.renders++;
	const list$ = read$(useDataStore().read(items));
	<li>{list$.get()[props.index]!.label as string}</li>
}

function OwnBound(props: RowProps) @{
	counts.renders++;
	const item$ = read$(useDataStore().read(item, { id: props.id }));
	const label$ = derived$(() => item$.get().label);
	<li>{label$ as string}</li>
}

function CardBound(props: RowProps) @{
	counts.renders++;
	const store = useDataStore();
	const a$ = read$(store.read(item, { id: props.ids[0]! }));
	const b$ = read$(store.read(item, { id: props.ids[1]! }));
	const c$ = read$(store.read(item, { id: props.ids[2]! }));
	const d$ = read$(store.read(item, { id: props.ids[3]! }));
	const aLabel$ = derived$(() => a$.get().label);
	const bLabel$ = derived$(() => b$.get().label);
	const cLabel$ = derived$(() => c$.get().label);
	const dLabel$ = derived$(() => d$.get().label);
	<li>
		<b>{aLabel$ as string}</b>
		<i>{bLabel$ as string}</i>
		<i>{cLabel$ as string}</i>
		<i>{dLabel$ as string}</i>
	</li>
}

function FieldBound(props: RowProps) @{
	counts.renders++;
	const list$ = read$(useDataStore().read(items));
	const index = props.index;
	const label$ = derived$(() => list$.get()[index]!.label);
	<li>{label$ as string}</li>
}

export const cells = { rows: OwnCell, stream: OwnCell, multi: CardCells, field: FieldCell };
export const bound = { rows: OwnBound, stream: OwnBound, multi: CardBound, field: FieldBound };
