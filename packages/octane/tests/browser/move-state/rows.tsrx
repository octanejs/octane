declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'move-tip': IntrinsicElements['div'];
			}
		}
	}
}

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

// A form's named controls shadow its DOM members, including moveBefore.
export function FormRows(props: { items: readonly StatefulRow[] }) @{
	<form>
		<input name="moveBefore" />
		@for (const row of props.items; key row.id) {
			<article data-row={String(row.id)}>{'row ' + row.id}</article>
		}
	</form>
}

// Two-root rows whose custom element dismisses its own tooltip when moved.
export function TipRows(props: { items: readonly StatefulRow[] }) @{
	<section>
		@for (const row of props.items; key row.id) {
			<>
				<move-tip data-row={String(row.id)} />
				<i>{'row ' + row.id}</i>
			</>
		}
		<input id="tip-other" />
	</section>
}
