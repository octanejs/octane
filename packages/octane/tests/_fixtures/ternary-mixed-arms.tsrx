// `{cond ? A : B}` at a child hole is lowered to an ifBlock when EITHER arm is
// a JSX literal (the setup-assigned value-hole variants live in
// hole-kind-flip.tsrx). These components pin the contract for the OTHER arm: a
// non-JSX arm is the branch's render VALUE (React renders it), never a dropped
// setup statement. Every component mounts on the non-JSX arm first — the
// regression rendered that arm as an empty host.

import { useState } from 'octane';

function Chip() @{
	<em>{'chip'}</em>
}

// The reported repro: a keyed `.map` array in one arm, a component in the other.
export function MapArm() @{
	const [mode, setMode] = useState(0);
	<div>
		<button class="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div class="host">
			{mode % 2 === 0 ? ['x', 'y'].map((id) => <i key={id}>{id as string}</i>) : <Chip />}
		</div>
	</div>
}

// The same shape written as directives: identical branch-slot + keyed-list
// runtime path, with the keyed list as the branch's sole root.
export function ForArm() @{
	const [mode, setMode] = useState(0);
	<div>
		<button class="next" onClick={() => setMode(mode + 1)}>{'next'}</button>
		<div class="host">
			@if (mode % 2 === 0) {
				@for (const id of ['x', 'y']; key id) {
					<i>{id as string}</i>
				}
			} @else {
				<Chip />
			}
		</div>
	</div>
}

export function StringArm() @{
	const [on, setOn] = useState(false);
	<div>
		<button class="flip" onClick={() => setOn(!on)}>{'flip'}</button>
		<div class="host">
			{on ? <b>{'yes'}</b> : 'nope'}
		</div>
	</div>
}

// The arm is an element held in a setup variable, not a JSX literal.
export function VarArm() @{
	const [on, setOn] = useState(false);
	const alt = <i>{'alt'}</i>;
	<div>
		<button class="flip" onClick={() => setOn(!on)}>{'flip'}</button>
		<div class="host">
			{on ? <b>{'yes'}</b> : alt}
		</div>
	</div>
}

// A nested ternary chain: every level must keep rendering, including the
// falsy-primitive tail (React renders `0`).
export function NestedTernary() @{
	const [n, setN] = useState(2);
	<div>
		<button class="next" onClick={() => setN(n + 1)}>{'next'}</button>
		<div class="host">
			{n % 3 === 0
				? <b>{'a'}</b>
				: n % 3 === 1
					? <i>{'b'}</i>
					: 0}
		</div>
	</div>
}

// A `null` consequent — this shape crashed the compiler outright.
export function NullConsequent() @{
	const [on, setOn] = useState(true);
	<div>
		<button class="flip" onClick={() => setOn(!on)}>{'flip'}</button>
		<div class="host">
			{on ? null : <b>{'no'}</b>}
		</div>
	</div>
}

// `undefined` renders nothing (an accidental pass before the fix — pinned so
// the repaired arm routing keeps treating it as empty, like React).
export function UndefinedArm() @{
	const [on, setOn] = useState(false);
	<div>
		<button class="flip" onClick={() => setOn(!on)}>{'flip'}</button>
		<div class="host">
			{on ? <b>{'yes'}</b> : undefined}
		</div>
	</div>
}

function Box(props) @{
	<section>{props.children}</section>
}

// Component-children position: the client folds this ternary into a descriptor
// VALUE (it is never claimed as an ifBlock there), and the server mirrors the
// fold — both arms must render and hydrate through the value path.
export function ChildrenArm() @{
	const [on, setOn] = useState(false);
	<div>
		<button class="flip" onClick={() => setOn(!on)}>{'flip'}</button>
		<div class="host">
			<Box>
				{on ? <b>{'yes'}</b> : 'nope'}
			</Box>
		</div>
	</div>
}

// The hole sits at a FRAGMENT-ROOT position (no enclosing host element). The
// client deliberately routes root-position rich holes through the value path
// (a portal there has no host to stamp), so this ternary renders as a VALUE on
// both sides — it must never be claimed into branch ranges.
export function RootFragArm() @{
	const [on, setOn] = useState(false);
	<>
		<button class="flip" onClick={() => setOn(!on)}>{'flip'}</button>
		{on ? <b>{'yes'}</b> : 'nope'}
	</>
}

// A logical `&&` arm: `false` renders nothing, an element renders.
export function AndArm() @{
	const [n, setN] = useState(0);
	<div>
		<button class="next" onClick={() => setN(n + 1)}>{'next'}</button>
		<div class="host">
			{n % 3 === 0 ? n % 2 === 0 && <i>{'maybe'}</i> : <b>{'jsx'}</b>}
		</div>
	</div>
}
