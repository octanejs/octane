import { useState } from 'octane';

let moduleSuffix = '';
export function setModuleSuffix(value) {
	moduleSuffix = value;
}

// Rows read `label` through a getter in the tests, so each read counts one
// render of that row's body.
export function MemoRows(props) @{
	const [ticks, setTicks] = useState(0);
	const [rows, setRows] = useState(props.rows);
	props.expose({ tick: () => setTicks(ticks + 1), setRows });
	<row-list ticks={ticks}>
		@for (const row of rows; key row.id) {
			<row-host
				id={row.id}
				class={row.on ? 'row on' : 'row'}
				onTap={() => props.select(props.prefix + row.id)}
			>
				<row-label value={String(row.label)} />
				@if (row.on) {
					<row-flag />
				}
			</row-host>
		}
	</row-list>
}

export function IndexRows(props) @{
	const [rows, setRows] = useState(props.rows);
	props.expose(setRows);
	<row-list>
		@for (const row of rows; index i; key row.id) {
			<row-host id={row.id} position={i} onTap={() => props.expose(null)}>
				<row-label value={row.label} />
			</row-host>
		}
	</row-list>
}

export function MethodRows(props) @{
	<row-list tick={props.tick}>
		@for (const row of props.rows; key row.id) {
			<row-host id={row.id} label={row.label.toUpperCase()} />
		}
	</row-list>
}

export function ModuleLetRows(props) @{
	<row-list tick={props.tick}>
		@for (const row of props.rows; key row.id) {
			<row-host id={row.id} label={row.label + moduleSuffix} />
		}
	</row-list>
}
