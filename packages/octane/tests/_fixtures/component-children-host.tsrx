import { useState, startTransition, use } from 'octane';

// One host element whose children are ALL component slots, each rendering
// through an @if/@else with single-host / single-component arms. These are the
// shapes the compiler proves single-root transitively, so the child slots
// mount anchorless — the contract pinned by component-children-host.test.ts is
// source order, sibling identity across arm flips, state survival, and clean
// teardown, regardless of which marker regime the slots use.

function Leaf(props) @{
	<span class="leaf">{props.label as string}</span>
}

// Local state inside the flipping component: the @if flip replaces only the
// branch content, so `n` must survive a big → leaf → big round trip.
function Panel(props) @{
	const [n, setN] = useState(0);
	@if (props.big) {
		<div class="big" onClick={() => setN(n + 1)}>{props.label + ':' + n as string}</div>
	} @else {
		<Leaf label={props.label} />
	}
}

export function Pair(props) @{
	<section class="host">
		<Panel big={props.aBig} label="A" />
		<Panel big={props.bBig} label="B" />
	</section>
}

// The spa-navigation bench shape: a recursive binary tree where every interior
// node is a host with two component children and every leaf is a component arm.
export function Tree(props) @{
	@if (props.depth > 0) {
		<div class="n">
			<Tree depth={props.depth - 1} path={props.path + 'L'} />
			<Tree depth={props.depth - 1} path={props.path + 'R'} />
		</div>
	} @else {
		<Leaf label={props.path} />
	}
}

function Counter(props) @{
	const [n, setN] = useState(0);
	<button class="c" onClick={() => setN(n + 1)}>{props.label + ':' + n as string}</button>
}

// Neighbouring contract: a keyed sibling must still remount (state reset) on a
// key change while the unkeyed sibling keeps its DOM node.
export function KeyedPair(props) @{
	<section class="host">
		<Counter key={props.k} label="A" />
		<Leaf label="B" />
	</section>
}

// Transition-driven arm flip in the first child while the second stays.
export function TransitionPair() @{
	const [aBig, setABig] = useState(true);
	<div>
		<button class="flip" onClick={() => startTransition(() => setABig(!aBig))}>flip</button>
		<section class="host">
			<Panel big={aBig} label="A" />
			<Panel big={true} label="B" />
		</section>
	</div>
}

// ---- Shapes that must NOT self-delimit (the single-root proof declines) ----
// These components can render zero or several top-level nodes, so their slots
// need an owned range. The tests flip them between siblings and assert order,
// sibling identity, and clean teardown — an over-widened proof that let these
// mount anchorless corrupts exactly those observations.

// Fragment arm: one syntactic root, two DOM roots.
function WidePanel(props) @{
	@if (props.big) {
		<>
			<div class="big">{props.label as string}</div>
			<em class="tail">{props.label as string}</em>
		</>
	} @else {
		<Leaf label={props.label} />
	}
}

// No @else: the component can render NOTHING.
function MaybePanel(props) @{
	@if (props.big) {
		<div class="big">{props.label as string}</div>
	}
}

export function WideTrio(props) @{
	<section class="host">
		<WidePanel big={props.aBig} label="A" />
		<MaybePanel big={props.bBig} label="B" />
		<Leaf label="C" />
	</section>
}

// A proven-single-root child that suspends before inserting anything: the
// boundary must fall back cleanly, and the resolved content must land in
// source order next to its sibling.
function AsyncPanel(props) @{
	const v = use(props.p);
	@if (props.big) {
		<div class="big">{v as string}</div>
	} @else {
		<Leaf label={v} />
	}
}

export function SuspendingPair(props) @{
	@try {
		<section class="host">
			<AsyncPanel big={true} p={props.p} />
			<Panel big={true} label="B" />
		</section>
	} @pending {
		<i class="fb">loading</i>
	}
}
