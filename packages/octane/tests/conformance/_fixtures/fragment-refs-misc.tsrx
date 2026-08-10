import { Fragment, useState, type FragmentInstance } from 'octane';

type FragmentReference =
	| { current: FragmentInstance | null }
	| ((fragment: FragmentInstance | null) => void | (() => void));

interface FragmentProps {
	fragRef: FragmentReference;
}

// scrollIntoView target — single focusable child.
export function ScrollTarget(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<button id="btn">go</button>
		</Fragment>
	</div>
}

// scrollIntoView falls back to first child element when nothing is
// focusable — used to verify the picking logic.
export function ScrollNonFocusable(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="first">first</div>
			<div id="second">second</div>
		</Fragment>
	</div>
}

export function ScrollNestedFocusable(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="first">
				<button id="nested">nested</button>
			</div>
			<div id="second">second</div>
		</Fragment>
	</div>
}

export function EmptyFragmentWithSiblings(props: FragmentProps) @{
	<div id="parent">
		<div id="before">before</div>
		<Fragment ref={props.fragRef}></Fragment>
		<div id="after">after</div>
	</div>
}

export function EmptyFragmentWithoutSiblings(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}></Fragment>
	</div>
}

export function EmptyFragmentWithTextSiblings(props: FragmentProps) @{
	<div id="parent">
		{'before' as string}
		<Fragment ref={props.fragRef}></Fragment>
		{'after' as string}
	</div>
}

// Text-only fragment — no host element children.
// (TSRX text expressions become Text nodes between the markers.)
export function TextOnly(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>{'just text' as string}</Fragment>
	</div>
}

export function MixedTextAndElements(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			{'before' as string}
			<span id="middle">middle</span>
			{'after' as string}
		</Fragment>
	</div>
}

// Nested fragments — each ref binds to its own marker range.
export function NestedFragments(props: {
	outerRef: FragmentReference;
	innerRef: FragmentReference;
}) @{
	<div id="parent">
		<Fragment ref={props.outerRef}>
			<div id="outer-a">a</div>
			<Fragment ref={props.innerRef}>
				<div id="inner-a">i-a</div>
				<div id="inner-b">i-b</div>
			</Fragment>
			<div id="outer-b">b</div>
		</Fragment>
	</div>
}

// Two sibling fragments — refs must NOT cross-contaminate.
export function SiblingFragments(props: {
	leftRef: FragmentReference;
	rightRef: FragmentReference;
}) @{
	<div id="parent">
		<Fragment ref={props.leftRef}>
			<div id="L1">L1</div>
			<div id="L2">L2</div>
		</Fragment>
		<Fragment ref={props.rightRef}>
			<div id="R1">R1</div>
			<div id="R2">R2</div>
		</Fragment>
	</div>
}

// Array refs on a Fragment — attachRef supports the same multi-ref
// shape as element-level refs.
export function ArrayRef(props: { refA: FragmentReference; refB: FragmentReference }) @{
	<div id="parent">
		<Fragment ref={[props.refA, props.refB]}>
			<button id="btn">x</button>
		</Fragment>
	</div>
}

// Conditional fragment — when toggled in, ref attaches; when toggled
// out, ref is cleared (object refs → null, callback refs → null).
let _setShow: ((value: boolean | ((previous: boolean) => boolean)) => void) | null = null;
export function setShow(v: boolean): void {
	if (_setShow) _setShow(v);
}
export function ConditionalFragment(props: FragmentProps) @{
	const [show, setShow] = useState(true);
	_setShow = setShow;
	<div id="parent">
		@if (show) {
			<Fragment ref={props.fragRef}>
				<div id="conditional">on</div>
			</Fragment>
		}
	</div>
}

// dispatchEvent through a fragment whose parent has a delegated click
// handler — verifies the event arrives at the parent's listener.
export function DispatchParent(props: FragmentProps & { onParent: (event: MouseEvent) => void }) @{
	<div id="parent" onClick={props.onParent}>
		<Fragment ref={props.fragRef}>
			<div id="child">child</div>
		</Fragment>
	</div>
}
