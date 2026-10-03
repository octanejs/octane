import { useState } from 'octane';

function Leaf() @{
	<b>{'l' as string}</b>
}

// A hooked leaf renders through the full component slot.
function HookedLeaf() @{
	const [v] = useState('h');
	<b>{v as string}</b>
}

// Each arm renders one root, so this is a single-root component whose body is
// a branch anchored at the component's own end.
function Flip(props: { leaf: boolean }) @{
	@if (props.leaf) {
		<Leaf />
	} @else {
		<p>{'f' as string}</p>
	}
}

function HookedFlip(props: { leaf: boolean }) @{
	@if (props.leaf) {
		<HookedLeaf />
	} @else {
		<p>{'f' as string}</p>
	}
}

// Each client arm calls `Flip` where the server's arm rendered a <u>, with no
// component range around it: the branch's root is rebuilt over the <u>.
export function Same(props: { on: boolean; leaf: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<Flip leaf={props.leaf} />
				<hr />
			</section>
		} @else {
			<section>
				<hr />
				<u>{'u' as string}</u>
				<hr />
			</section>
		}
	</div>
}

// The call is its host's last child.
export function Last(props: { on: boolean; leaf: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<Flip leaf={props.leaf} />
			</section>
		} @else {
			<section>
				<hr />
				<u>{'u' as string}</u>
			</section>
		}
	</div>
}

// The call is the last root of an arm's fragment.
export function Arm(props: { on: boolean; leaf: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<hr />
				<Flip leaf={props.leaf} />
			</>
		} @else {
			<>
				<hr />
				<u>{'u' as string}</u>
			</>
		}
	</div>
}

export function Hooked(props: { on: boolean; leaf: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<HookedFlip leaf={props.leaf} />
				<hr />
			</section>
		} @else {
			<section>
				<hr />
				<u>{'u' as string}</u>
				<hr />
			</section>
		}
	</div>
}

// The server's arm rendered a <p> where the call is, so the branch adopts it.
export function Match(props: { on: boolean; leaf: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<Flip leaf={props.leaf} />
				<hr />
			</section>
		} @else {
			<section>
				<hr />
				<p>{'f' as string}</p>
				<hr />
			</section>
		}
	</div>
}

// The server's arm rendered a <b> where the call is, so the branch's
// component arm adopts it.
export function MatchLeaf(props: { on: boolean; leaf: boolean }) @{
	<div id="r">
		@if (props.on) {
			<section>
				<hr />
				<HookedFlip leaf={props.leaf} />
				<hr />
			</section>
		} @else {
			<section>
				<hr />
				<b>{'h' as string}</b>
				<hr />
			</section>
		}
	</div>
}
