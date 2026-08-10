import { Fragment, type FragmentInstance } from 'octane';

interface FragmentProps {
	fragRef: { current: FragmentInstance | null };
}

// Two focusable inputs side-by-side — covers basic focus() and focusLast().
export function TwoInputs(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<input id="a" />
			<input id="b" />
		</Fragment>
	</div>
}

// disabled button must be skipped by focus() / focusLast().
export function DisabledThenButton(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<button id="bad" disabled>x</button>
			<button id="good">y</button>
		</Fragment>
	</div>
}

// Non-focusable elements at the head — focus() must walk past them.
export function NonFocusableBeforeButton(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div>not focusable</div>
			<span>also not</span>
			<button id="target">target</button>
		</Fragment>
	</div>
}

export function FocusableFieldset(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<fieldset>
				<legend>Shipping</legend>
				<input id="street" />
				<input id="city" />
			</fieldset>
		</Fragment>
	</div>
}

// Nothing focusable — focus() and focusLast() must no-op.
export function NoFocusable(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div>a</div>
			<span>b</span>
		</Fragment>
	</div>
}

// Explicit tabIndex=0 on a div makes it focusable.
export function ExplicitTabIndex(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="tabbable" tabIndex={0}>tabbable</div>
		</Fragment>
	</div>
}

// tabIndex=-1 remains programmatically focusable even though keyboard tabbing
// skips it; FragmentInstance.focus() still chooses it in document order.
export function SkipsNegativeTabIndex(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<input id="skip" tabIndex={-1} />
			<input id="keep" />
		</Fragment>
	</div>
}

// blur() target — a single focused input inside the fragment.
export function BlurInside(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<input id="inside" />
		</Fragment>
	</div>
}

// blur() must be a no-op when focus is OUTSIDE the fragment. Provides
// both an outside input and an inside fragment (no focusable elements
// in the fragment, so any focused element is necessarily outside).
export function BlurOutside(props: FragmentProps) @{
	<div id="parent">
		<input id="outside" />
		<Fragment ref={props.fragRef}>
			<div>nothing focusable</div>
		</Fragment>
	</div>
}
