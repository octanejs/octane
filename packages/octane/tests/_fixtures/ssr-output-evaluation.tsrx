import { use, useId } from 'octane';

export function SingleAttribute(props) @{
	<div title={props.read('title')}>
		<span>{props.child() as string}</span>
	</div>
}

export function MultipleAttributes(props) @{
	<div title={props.read('title')} data-value={props.read('value')}>
		<span title={props.read('nested')}>{props.child() as string}</span>
	</div>
}

export function SpreadAttribute(props) @{
	<div {...props.read('spread')} title={props.read('title')}>{props.child() as string}</div>
}

export function KeyedRows(props) @{
	<ul>
		@for (const row of props.rows; key props.key(row)) {
			props.visit(row, arguments.length);
			<li data-id={row.id}>{row.label as string}</li>
		} @empty {
			<li>empty</li>
		}
	</ul>
}

export function DestructuredRows(props) @{
	<ul>
		@for (const { id, label = props.fallback() } of props.rows; index index; key props.key(
			id,
			index,
		)) {
			props.visit(id, index, arguments.length);
			<li data-id={id}>{label as string}</li>
		}
	</ul>
}

function AsyncRow(props) @{
	const id = useId();
	const value = use(props.row.value);
	<li data-id={props.row.id} id={id}>{value as string}</li>
}

export function AsyncRows(props) @{
	<ul>
		@for (const row of props.rows; key row.id) {
			<AsyncRow row={row} />
		}
	</ul>
}
