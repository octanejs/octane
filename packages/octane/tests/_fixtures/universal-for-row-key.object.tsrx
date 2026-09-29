import { useState } from 'octane';

// `allocate` runs once per mount, so a row's `mount` follows its owner: it
// moves with the item under an item key and stays with the slot under a
// positional key, and a remount allocates a fresh one.
function RowState(props) @{
	const [mount] = useState(props.allocate);
	<row-state id={props.id} mount={mount} />
}

export function AttributeHostRows(props) @{
	<row-list>
		@for (const row of props.rows) {
			<row-host key={row.id} id={row.id}>
				<RowState id={row.id} allocate={props.allocate} />
			</row-host>
		}
	</row-list>
}

export function HeaderHostRows(props) @{
	<row-list>
		@for (const row of props.rows; key row.id) {
			<row-host id={row.id}>
				<RowState id={row.id} allocate={props.allocate} />
			</row-host>
		}
	</row-list>
}

export function AttributeComponentRows(props) @{
	<row-list>
		@for (const row of props.rows) {
			<RowState key={row.id} id={row.id} allocate={props.allocate} />
		}
	</row-list>
}

export function HeaderComponentRows(props) @{
	<row-list>
		@for (const row of props.rows; key row.id) {
			<RowState id={row.id} allocate={props.allocate} />
		}
	</row-list>
}

// The header keys rows by position; the root attribute takes precedence.
export function PrecedenceRows(props) @{
	<row-list>
		@for (const row of props.rows; index i; key i) {
			<RowState key={row.id} id={row.id} allocate={props.allocate} />
		}
	</row-list>
}

// No key at all: universal rows fall back to their position.
export function PositionalRows(props) @{
	<row-list>
		@for (const row of props.rows) {
			<RowState id={row.id} allocate={props.allocate} />
		}
	</row-list>
}

// A key below the root still names its own element within the row.
export function NestedKeyRows(props) @{
	<row-list>
		@for (const row of props.rows) {
			<row-host key={row.id} id={row.id}>
				<RowState key={row.version} id={row.id} allocate={props.allocate} />
			</row-host>
		}
	</row-list>
}
