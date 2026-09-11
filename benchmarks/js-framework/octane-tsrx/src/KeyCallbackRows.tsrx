import type { OctaneNode } from 'octane';

type Group = { id: number; rows: OctaneNode[] };
type Row = { id: number; label: string };
type MappedGroup = { id: number; rows: (Row & { key: string | number })[] };

function DescriptorList(props: { group: Group }) @{
	<section data-group={props.group.id}>
		<ul>{props.group.rows}</ul>
	</section>
}

export function ManyDescriptorLists(props: { groups: Group[]; version: number }) @{
	<main data-kind="many" data-version={props.version}>
		@for (const group of props.groups; key group.id) {
			<DescriptorList group={group} />
		}
	</main>
}

function MappedList(props: { group: MappedGroup }) @{
	<section data-group={props.group.id}>
		<ul>{props.group.rows.map(
			(row) => <li key={row.key} data-row={row.id}>
				<input defaultValue={row.label} aria-label={row.label} />
			</li>,
		)}</ul>
	</section>
}

export function ManyMappedLists(props: { groups: MappedGroup[]; version: number }) @{
	<main data-kind="mapped" data-version={props.version}>
		@for (const group of props.groups; key group.id) {
			<MappedList group={group} />
		}
	</main>
}

// The same total number of rows, with keys read by the compiled @for path.
export function CompiledRows(props: { rows: Row[]; version: number }) @{
	<main data-kind="compiled" data-version={props.version}>
		<ul>
			@for (const row of props.rows; key row.id) {
				<li data-row={row.id}>
					<input defaultValue={row.label} aria-label={row.label} />
				</li>
			}
		</ul>
	</main>
}
