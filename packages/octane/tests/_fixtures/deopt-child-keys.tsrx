// A compiled template whose sole child is a HOLE: descriptor arrays handed to
// `{props.rows}` reach the de-opt keyed list, which is the path every
// `@octanejs/*` binding's rendered output takes. Raw `createElement(host, null,
// children)` reconciles through a different keying function, so a fixture with
// a real hole is required to exercise this one.
export function RowsHole(props) @{
	<ul class="rows">{props.rows}</ul>
}

function MappedInputRow(props) @{
	<li data-row={props.row.id}>
		<input data-input={props.row.id} defaultValue={props.row.label} />
		{props.row.children}
	</li>
}

export function MappedInputRows(props) @{
	<ul class="mapped-rows">{props.rows.map((row) => <MappedInputRow key={row.id} row={row} />)}</ul>
}
