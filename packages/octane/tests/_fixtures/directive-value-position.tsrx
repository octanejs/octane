import type { OctaneNode } from 'octane';

interface Row {
	id: string;
	label: string;
}

interface Props {
	visible: boolean;
	rows: Row[];
	mode: string;
	read?: (row: Row) => string;
}

// Renders whatever renderable it is handed, so every fixture below can prove its
// value-position directive survived compilation as a real renderable.
function Panel(props: { slot: OctaneNode }) @{
	<div class="panel">{props.slot}</div>
}

// A directive is the whole initializer. It has no JSX parent to print into, so
// the lowered descriptor must stand alone as an expression.
export function BareDirectiveValue(props: Props) @{
	const branch = @if (props.visible) {
		<p id="bare-if">shown</p>
	} @else {
		<p id="bare-if">hidden</p>
	};
	const list = @for (const row of props.rows; key row.id) {
		<li class="bare-row">{row.label}</li>
	} @empty {
		<li id="bare-empty">none</li>
	};
	<section id="bare">
		{branch}
		<ul>{list}</ul>
	</section>
}

// A directive standing directly at an attribute value.
export function DirectiveAttributeValue(props: Props) @{
	<section id="attr-directive">
		<Panel
			slot={@switch (props.mode) {
				@case 'primary': {
					<strong id="attr-mode">Primary</strong>
				}
				@default: {
					<strong id="attr-mode">Secondary</strong>
				}
			}}
		/>
	</section>
}

// PR 1386's headline shape: an ELEMENT at attribute value position whose own
// children hold a directive. The host element is a value, so its children never
// reach the template walk.
export function ElementAttributeValue(props: Props) @{
	<section id="attr-element">
		<Panel
			slot={<h1 class="attr-heading">
				before
				@if (props.visible) {
					<em id="attr-el-if">yes</em>
				} @else {
					<em id="attr-el-if">no</em>
				}
				after
			</h1>}
		/>
	</section>
}

// The same element-holding-a-directive, reached through an expression container
// in child position rather than an attribute.
export function ElementContainerChild(props: Props) @{
	<section id="container-element">
		{<h1 class="container-heading">
			<a id="container-sibling" />

			@if (props.visible) {
				<em id="container-el-if">yes</em>
			} @else {
				<em id="container-el-if">no</em>
			}
		</h1>}
	</section>
}

// A directive directly inside a child expression container, including the
// error/pending arms so the boundary shape is exercised too.
export function DirectiveContainerChild(props: Props) @{
	<section id="container-directive">
		{@try {
			<Row row={props.rows[0]} read={props.read} />
		} @pending {
			<p id="container-pending">loading</p>
		} @catch (error) {
			<p id="container-error">{'failed: ' + error.message}</p>
		}}
	</section>
}

function Row(props: { row: Row; read?: (row: Row) => string }) @{
	const label =
		props.read ? props.read(props.row) : props.row.label;
	<span class="container-row">{label as string}</span>
}
