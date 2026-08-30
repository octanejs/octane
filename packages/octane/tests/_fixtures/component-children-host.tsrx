/**
 * All-component-children hosts: every child of the <section> is a component,
 * so the compiler may mount the child slots by appending (no per-child
 * anchors). These shapes pin the sibling-order contract for that regime,
 * especially a child that renders NOTHING at mount and grows content on a
 * later render (the conditional-panel pattern).
 *
 * The second half covers children whose @if/@else bodies are proven
 * single-root transitively (host or component arms), so the slots mount with
 * no minted markers — the contract there is source order, sibling identity
 * across arm flips, state survival, and clean teardown, regardless of which
 * marker regime the slots use.
 */
import { useState, startTransition, use } from 'octane';

function Leaf(props: { label: string }) @{
	<span class="leaf">{props.label as string}</span>
}

function MaybePanel(props: { big?: boolean; label: string }) @{
	@if (props.big) {
		<div class="big">{props.label as string}</div>
	}
}

/** A conditional panel ahead of an always-present leaf. */
export function WideTrio(props: { bBig?: boolean }) @{
	<section class="host">
		<MaybePanel big={props.bBig} label="B" />
		<Leaf label="C" />
	</section>
}

/** Two independently toggled panels ahead of an always-present leaf. */
export function WidePanels(props: { aBig?: boolean; bBig?: boolean }) @{
	<section class="host">
		<MaybePanel big={props.aBig} label="A" />
		<MaybePanel big={props.bBig} label="B" />
		<Leaf label="C" />
	</section>
}

/** A conditional panel in TRAILING position — append-at-end is source order. */
export function TrailingPanel(props: { zBig?: boolean }) @{
	<section class="host">
		<Leaf label="A" />
		<MaybePanel big={props.zBig} label="Z" />
	</section>
}

/** A full @if/@else chain: always renders exactly one element. */
function EitherPanel(props: { big?: boolean; label: string }) @{
	@if (props.big) {
		<div class="big">{props.label as string}</div>
	} @else {
		<span class="small">{props.label as string}</span>
	}
}

/** An always-rendering chain child ahead of a leaf. */
export function ChainTrio(props: { aBig?: boolean }) @{
	<section class="host">
		<EitherPanel big={props.aBig} label="A" />
		<Leaf label="C" />
	</section>
}

/** A full chain whose taken arm mounts a MAY-RENDER-NOTHING panel. */
function PanelViaChain(props: { off?: boolean; big?: boolean; label: string }) @{
	@if (props.off) {
		<span class="off">off</span>
	} @else {
		<MaybePanel big={props.big} label={props.label} />
	}
}

/** The empty-mount hazard reached TRANSITIVELY through a chain child. */
export function TransitiveTrio(props: { bBig?: boolean }) @{
	<section class="host">
		<PanelViaChain big={props.bBig} label="B" />
		<Leaf label="C" />
	</section>
}

/** A root-first multi-hop chain whose leaf can mount empty. */
export function MultiHopTransitiveTrio(props: { bBig?: boolean }) @{
	<section class="host">
		<MultiHopOuter big={props.bBig} label="B" />
		<Leaf label="C" />
	</section>
}

function MultiHopOuter(props: { fallback?: boolean; big?: boolean; label: string }) @{
	@if (props.fallback) {
		<span class="fallback">outer</span>
	} @else {
		<MultiHopMiddle big={props.big} label={props.label} />
	}
}

function MultiHopMiddle(props: { fallback?: boolean; big?: boolean; label: string }) @{
	@if (props.fallback) {
		<span class="fallback">middle</span>
	} @else {
		<MultiHopEmptyLeaf big={props.big} label={props.label} />
	}
}

function MultiHopEmptyLeaf(props: { big?: boolean; label: string }) @{
	@if (props.big) {
		<div class="big">{props.label as string}</div>
	}
}

// ---- Single-root proven children (anchorless componentSlot regime) ----

// Local state inside the flipping component: the @if flip replaces only the
// branch content, so `n` must survive a big → leaf → big round trip.
function Panel(props: { big?: boolean; label: string }) @{
	const [n, setN] = useState(0);
	@if (props.big) {
		<div class="big" onClick={() => setN(n + 1)}>{props.label + ':' + n as string}</div>
	} @else {
		<Leaf label={props.label} />
	}
}

export function Pair(props: { aBig?: boolean; bBig?: boolean }) @{
	<section class="host">
		<Panel big={props.aBig} label="A" />
		<Panel big={props.bBig} label="B" />
	</section>
}

// The spa-navigation bench shape: a recursive binary tree where every interior
// node is a host with two component children and every leaf is a component arm.
export function Tree(props: { depth: number; path: string }) @{
	@if (props.depth > 0) {
		<div class="n">
			<Tree depth={props.depth - 1} path={props.path + 'L'} />
			<Tree depth={props.depth - 1} path={props.path + 'R'} />
		</div>
	} @else {
		<Leaf label={props.path} />
	}
}

function Counter(props: { label: string }) @{
	const [n, setN] = useState(0);
	<button class="c" onClick={() => setN(n + 1)}>{props.label + ':' + n as string}</button>
}

// Neighbouring contract: a keyed sibling must still remount (state reset) on a
// key change while the unkeyed sibling keeps its DOM node.
export function KeyedPair(props: { k: number }) @{
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

// Fragment arm: one syntactic root, two DOM roots — can never self-delimit,
// so its slot must keep an owned range whatever the callee proof admits.
function WidePanel(props: { big?: boolean; label: string }) @{
	@if (props.big) {
		<>
			<div class="big">{props.label as string}</div>
			<em class="tail">{props.label as string}</em>
		</>
	} @else {
		<Leaf label={props.label} />
	}
}

export function FragmentTrio(props: { aBig?: boolean; bBig?: boolean }) @{
	<section class="host">
		<WidePanel big={props.aBig} label="A" />
		<MaybePanel big={props.bBig} label="B" />
		<Leaf label="C" />
	</section>
}

// A proven-single-root child that suspends before inserting anything: the
// boundary must fall back cleanly, and the resolved content must land in
// source order next to its sibling.
function AsyncPanel(props: { big?: boolean; p: Promise<string> }) @{
	const v = use(props.p);
	@if (props.big) {
		<div class="big">{v as string}</div>
	} @else {
		<Leaf label={v} />
	}
}

export function SuspendingPair(props: { p: Promise<string> }) @{
	@try {
		<section class="host">
			<AsyncPanel big={true} p={props.p} />
			<Panel big={true} label="B" />
		</section>
	} @pending {
		<i class="fb">loading</i>
	}
}
