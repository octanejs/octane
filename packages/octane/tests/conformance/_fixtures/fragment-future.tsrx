import { Fragment, createPortal, useState, type FragmentInstance } from 'octane';

type FragmentRef =
	| ((fragment: FragmentInstance | null) => void | (() => void))
	| { current: FragmentInstance | null }
	| null;

interface FragmentProps {
	fragRef: FragmentRef;
}

interface FragmentPortalProps extends FragmentProps {
	target: Element;
}

// A fragment whose child set changes at runtime: #a is always present, #b
// mounts and unmounts whenever the toggle flips.
export function FutureChildren(props: FragmentProps) @{
	const [show, setShow] = useState(false);
	<div id="host">
		<button
			id="toggle"
			type="button"
			onClick={() => setShow((current) => !current)}
		>{'toggle'}</button>
		<Fragment ref={props.fragRef}>
			<button id="a" type="button">{'a'}</button>
			@if (show) {
				<button id="b" type="button">{'b'}</button>
			}
		</Fragment>
	</div>
}

// A <Fragment ref> whose ref expression can change across renders (props.pick),
// to exercise the compiler's fragmentRef update path.
export function FragmentRefUpdate(props: { pick: FragmentRef }) @{
	<div id="host">
		<Fragment ref={props.pick}>
			<span id="x">{'x'}</span>
		</Fragment>
	</div>
}

export function FragmentPortalChildren(props: FragmentPortalProps) @{
	<div id="fragment-portal-parent">
		{createPortal(<button id="unowned-portal">{'outside'}</button>, props.target)}
		<Fragment ref={props.fragRef}>
			<button id="inline-before">{'before'}</button>
			{createPortal(<button id="owned-portal">{'portal'}</button>, props.target)}
			<button id="inline-after">{'after'}</button>
		</Fragment>
	</div>
}

export function NestedFragmentPortals(props: {
	outerRef: FragmentRef;
	innerRef: FragmentRef;
	target: Element;
}) @{
	<div id="nested-portal-parent">
		<Fragment ref={props.outerRef}>
			<button id="outer-inline">{'outer'}</button>
			<Fragment ref={props.innerRef}>
				{createPortal(<button id="shared-portal">{'shared'}</button>, props.target)}
				<button id="inner-inline">{'inner'}</button>
			</Fragment>
			{createPortal(<button id="outer-portal">{'outer portal'}</button>, props.target)}
		</Fragment>
	</div>
}

export function RootFragmentPortals(props: FragmentPortalProps) @{
	<Fragment ref={props.fragRef}>
		{createPortal(<button id="root-portal-before">{'before'}</button>, props.target)}
		<button id="root-inline">{'inline'}</button>
		{createPortal(<button id="root-portal-after">{'after'}</button>, props.target)}
	</Fragment>
}

export function ConditionalFragmentPortal(props: FragmentPortalProps) @{
	const [show, setShow] = useState(false);
	<div id="conditional-portal-parent">
		<button
			id="conditional-toggle"
			onClick={() => setShow((current) => !current)}
		>{'toggle'}</button>
		<Fragment ref={props.fragRef}>
			<button id="conditional-before">{'before'}</button>
			{show
				? createPortal(<button id="conditional-portal">{'portal'}</button>, props.target)
				: null}
			<button id="conditional-after">{'after'}</button>
		</Fragment>
	</div>
}

function ReturnedFragmentPortal(props: { target: Element }) {
	return createPortal(<button id="component-portal">{'portal'}</button>, props.target);
}

export function ComponentFragmentPortal(props: FragmentPortalProps) @{
	<div id="component-portal-parent">
		<Fragment ref={props.fragRef}>
			<button id="component-before">{'before'}</button>
			<ReturnedFragmentPortal target={props.target} />
			<button id="component-after">{'after'}</button>
		</Fragment>
	</div>
}

interface InterleavedPortalProps extends FragmentPortalProps {
	showOwned: boolean;
	showSibling: boolean;
	showLate: boolean;
	onSiblingClick(): void;
}

function InterleavedOwnedPortal(props: InterleavedPortalProps) @{
	<Fragment>{createPortal(
		<Fragment ref={props.fragRef}>
			<button id="interleaved-owned-first" type="button">{'first'}</button>
			@if (props.showLate) {
				<button id="interleaved-owned-late" type="button">{'late'}</button>
			}
		</Fragment>,
		props.target,
	)}</Fragment>
}

function InterleavedIndependentPortal(props: InterleavedPortalProps) {
	return createPortal(
		<button
			id="interleaved-independent"
			type="button"
			onClick={props.onSiblingClick}
		>{'independent'}</button>,
		props.target,
	);
}

export function InterleavedFragmentPortals(props: InterleavedPortalProps) @{
	<Fragment>
		@if (props.showOwned) {
			<InterleavedOwnedPortal {...props} />
		}
		@if (props.showSibling) {
			<InterleavedIndependentPortal {...props} />
		}
	</Fragment>
}

function ThrowAfterFragment(props: { capture(node: Element): void }) {
	const child = document.querySelector('#aborted-fragment-child');
	if (child !== null) props.capture(child);
	throw new Error('discard fragment');
}

export function AbortedFragmentOwnership(props: FragmentProps & { capture(node: Element): void }) @{
	<div id="aborted-fragment-parent">
		@try {
			<>
				<Fragment ref={props.fragRef}>
					<button id="aborted-fragment-child">{'aborted'}</button>
				</Fragment>
				<ThrowAfterFragment capture={props.capture} />
			</>
		} @catch (error) {
			<span id="aborted-fragment-fallback">{'fallback'}</span>
		}
	</div>
}
