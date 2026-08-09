import { tables } from '@livestore/framework-toolkit/testing';
import { queryDb } from '@livestore/livestore';
import { useSyncStatus } from '@octanejs/livestore';

export function DocumentReader(props: {
	store: any;
	table: any;
	id?: any;
	onSetter: (setter: (value: any) => void) => void;
}) @{
	const [row, setRow, id] = props.store.useClientDocument(props.table, props.id);
	props.onSetter(setRow);
	<div id="document" data-id={id}>{JSON.stringify(row)}</div>
}

export function ChainedDocumentReader(props: {
	store: any;
	userId: string;
	onRender?: () => void;
}) @{
	props.onRender?.();
	const [_row, _setRow, _id, rowState$] = props.store.useClientDocument(
		tables.userInfo,
		props.userId,
	);
	const todos = props.store.useQuery(
		queryDb((get) => {
			const row = get(rowState$) as { text: string };
			return tables.todos.where('text', 'LIKE', `%${row.text}%`);
		}, {
			label: 'todosFiltered',
			deps: props.userId,
		}),
	);
	<div id="chained" data-count={String(todos.length)}>{JSON.stringify(todos)}</div>
}

export function KvDocumentReader(props: {
	store: any;
	id: string;
	onSetter: (setter: (value: any) => void) => void;
	onRender?: () => void;
}) @{
	props.onRender?.();
	const [state, setState, id] = props.store.useClientDocument(tables.kv, props.id);
	props.onSetter(setState);
	<div id="kv" data-id={id}>{JSON.stringify(state)}</div>
}

export function SyncReader(props: { store: any }) @{
	const status = useSyncStatus({ store: props.store });
	<div id="sync">{JSON.stringify(status)}</div>
}
