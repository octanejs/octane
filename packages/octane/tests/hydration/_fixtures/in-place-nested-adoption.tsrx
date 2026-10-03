import { useState } from 'octane';
import { Callee } from './in-place-mismatch-swap-callee.tsrx';

// Each client arm calls a component where the server's arm rendered a <b>,
// with no component range around it. The callee's branch renders a hooked
// component whose <b> root adopts that node, so the callee adopts it too.

// The imported `Callee` is proven single-root: its root is the adopted <b>.
export function SwapLeaf(props: { on: boolean; n: string }) @{
	<div id="r">
		@if (props.on) {
			<section title={props.n}>
				<hr />
				<Callee />
				<hr />
			</section>
		} @else {
			<section title={props.n}>
				<hr />
				<b>{'l' as string}</b>
				<hr />
			</section>
		}
	</div>
}

// The callee is the whole client arm, and the server's arm rendered a node
// after the <b> it adopts.
export function ArmTail(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<Callee />
		} @else {
			<>
				<b>{'l' as string}</b>
				<i>{'x' as string}</i>
			</>
		}
	</div>
}

function Leaf() @{
	const [v] = useState('l');
	<b>{v as string}</b>
}

// The other arm renders two roots, so the call is not single-root and renders
// unframed in place of the server's <b>.
function Pair(props: { leaf: boolean }) @{
	@if (props.leaf) {
		<Leaf />
	} @else {
		<>
			<p>{'f' as string}</p>
			<p>{'g' as string}</p>
		</>
	}
}

export function Unframed(props: { on: boolean; leaf: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<Pair leaf={props.leaf} />
				<hr />
			</section>
		} @else {
			<section>
				<hr />
				<b>{'l' as string}</b>
				<hr />
			</section>
		}
	</div>
}
