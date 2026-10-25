export interface StatefulRow {
	id: number;
}

export function CompiledRows(props: { items: readonly StatefulRow[] }) @{
	<section>
		@for (const row of props.items; key row.id) {
			<article data-row={String(row.id)}>
				<iframe srcdoc="<p>frame</p>" />
				<div class="spinner" />
				<div popover="manual">{'popover ' + row.id}</div>
			</article>
		}
	</section>
}

// Binding views exclude resource elements such as iframes.
export function BoundRows(props: { items: readonly { id: string }[] }) @{
	'use dom bindings';
	<>
		@for (const row of props.items; key row.id) {
			<article data-row={row.id}>
				<div class="spinner" />
				<div popover="manual">{'popover ' + row.id}</div>
			</article>
		}
	</>
}
