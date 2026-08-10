import { Fragment, type FragmentInstance } from 'octane';

interface FragmentProps {
	fragRef: { current: FragmentInstance | null };
}

// Sibling before the fragment, fragment with one child, sibling after —
// exercises every region compareDocumentPosition can report.
export function SurroundedFragment(props: FragmentProps) @{
	<div id="parent">
		<div id="before">before</div>
		<Fragment ref={props.fragRef}>
			<div id="inside">inside</div>
		</Fragment>
		<div id="after">after</div>
	</div>
}

// Just the parent + a single fragment child — used by dispatchEvent test
// to verify the event reaches a listener on the parent.
export function ParentWithFragmentChild(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="child">x</div>
		</Fragment>
	</div>
}

export function EmptySurroundedFragment(props: FragmentProps) @{
	<div id="parent">
		<div id="before">before</div>
		<Fragment ref={props.fragRef}></Fragment>
		<div id="after">after</div>
	</div>
}

export function NestedPositionFragment(props: FragmentProps) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="inside">
				<span id="nested">nested</span>
			</div>
		</Fragment>
	</div>
}
