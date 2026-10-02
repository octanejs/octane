import { useState } from 'octane';

// Each client arm renders a component whose template holds another component
// call after a static root. The server rendered the other arm, which has no
// range for the outer call.

let label = 'p';

function Em() @{
	<em>{'e' as string}</em>
}

// Calls a hook, so it renders through a full component slot.
function StateEm() @{
	const [value] = useState('e');
	<em>{value as string}</em>
}

function IEm() @{
	<>
		<i>{label as string}</i>
		<Em />
	</>
}

function IStateEm() @{
	<>
		<i>{label as string}</i>
		<StateEm />
	</>
}

function DivEm() @{
	<div>
		<i>{label as string}</i>
		<Em />
	</div>
}

function DivStateEm() @{
	<div>
		<i>{label as string}</i>
		<StateEm />
	</div>
}

// The server rendered the inner call's markup inline, so the hole's server
// node is that element rather than an open marker.
export function HoleRaw(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<IEm />
				<Em />
			</>
		} @else {
			<>
				<i>{label as string}</i>
				<em>{'e' as string}</em>
				<Em />
			</>
		}
	</div>
}

// The server framed the inner call, so the hole's server node is its open marker.
export function HoleFramed(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<IEm />
				<Em />
			</>
		} @else {
			<>
				<i>{label as string}</i>
				<Em />
				<Em />
			</>
		}
	</div>
}

export function HoleRawState(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<IStateEm />
				<Em />
			</>
		} @else {
			<>
				<i>{label as string}</i>
				<em>{'e' as string}</em>
				<Em />
			</>
		}
	</div>
}

// The outer call's template is a single element holding the hole.
export function HoleRawElement(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<DivEm />
				<Em />
			</>
		} @else {
			<>
				<div>
					<i>{label as string}</i>
					<em>{'e' as string}</em>
				</div>
				<Em />
			</>
		}
	</div>
}

// The server's element ends before the hole, so the walk finds no server node.
export function HoleMissingElement(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<DivEm />
				<Em />
			</>
		} @else {
			<>
				<div>
					<i>{label as string}</i>
				</div>
				<Em />
			</>
		}
	</div>
}

export function HoleMissingElementState(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<DivStateEm />
				<Em />
			</>
		} @else {
			<>
				<div>
					<i>{label as string}</i>
				</div>
				<Em />
			</>
		}
	</div>
}
