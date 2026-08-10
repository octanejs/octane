/**
 * All-component-children hosts: every child of the <section> is a component,
 * so the compiler may mount the child slots by appending (no per-child
 * anchors). These shapes pin the sibling-order contract for that regime,
 * especially a child that renders NOTHING at mount and grows content on a
 * later render (the conditional-panel pattern).
 */

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
