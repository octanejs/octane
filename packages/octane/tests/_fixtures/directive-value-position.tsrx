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

// A directive at module value position. It has no component body to own it and
// needs none — it can only close over module bindings, so its arms hoist to
// module scope beside it.
export const moduleFlag = { on: true };

const moduleBranch = @if (moduleFlag.on) {
	<em id="module-if">module-on</em>
} @else {
	<em id="module-if">module-off</em>
};

export function ModuleDirectiveValue() @{
	<section id="module-value">{moduleBranch}</section>
}

// A directive inside a CALLBACK, reading the callback's own parameter. The arms
// are hoisted, so `row` can only reach them through the construct's `__extra`
// env tuple — which is built at the call site, inside the callback.
export function CallbackDirective(props: Props) @{
	const renderRow = (row: Row) => <Panel
		slot={<span class="cb-row" data-id={row.id}>
			@if (row.label.length > 3) {
				<b class="cb-long">{row.label}</b>
			} @else {
				<i class="cb-short">{row.label}</i>
			}
		</span>}
	/>;
	<section id="callback-value">{props.rows.map(renderRow)}</section>
}

// `@try` inside a callback: its arms capture the callback's parameter too, and
// the @catch arm has to be reachable from inside the callback.
export function CallbackTryDirective(props: Props) @{
	const renderRow = (row: Row) => <div class="try-row" data-id={row.id}>
		@try {
			<b class="try-ok">
				{props.read ? props.read(row) : row.label}
			</b>
		} @pending {
			<i class="try-pending">loading</i>
		} @catch (error) {
			<s class="try-error">{row.id + ':' + error.message}</s>
		}
	</div>;
	<section id="callback-try">{props.rows.map(renderRow)}</section>
}

// The same capture, with the directive at CHILD position rather than in an
// attribute value, and a second callback nested inside the first.
export function NestedCallbackDirective(props: Props) @{
	const outer = (row: Row) => (suffix: string) => <div class="nested-row" data-id={row.id}>
		@if (props.visible) {
			<b class="nested-on">{row.label + suffix}</b>
		} @else {
			<i class="nested-off">{row.id + suffix}</i>
		}
	</div>;
	<section id="nested-callback">{props.rows.map((row) => outer(row)('!'))}</section>
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
