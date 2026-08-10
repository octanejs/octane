import * as Octane from 'octane';
import {
	Fragment,
	Fragment as Group,
	type FragmentInstance,
	useLayoutEffect,
	useEffect,
	useState,
} from 'octane';
import { ValueFragment as ForeignGroup } from '../../_fixtures/fragments.tsrx';

type FragmentCallback = (instance: unknown) => void;
type FragmentObject = { current: FragmentInstance | null };
type HostObject = { current: HTMLButtonElement | null };

// Stage 1 — basic fragment ref attach. React parity: rendering
// `<Fragment ref={r}>` populates `r.current` with a FragmentInstance.
export function FragmentObjectRef(props: { fragRef: FragmentObject }) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="child">{'hi' as string}</div>
		</Fragment>
	</div>
}

export function AliasedFragmentObjectRef(props: { fragRef: FragmentObject }) @{
	<div id="alias-parent">
		<Group ref={props.fragRef}>
			<button id="alias-child">{'aliased'}</button>
		</Group>
	</div>
}

export function NamespacedFragmentObjectRef(props: { fragRef: FragmentObject }) @{
	<div id="namespace-parent">
		<Octane.Fragment ref={props.fragRef}>
			<button id="namespace-child">{'namespaced'}</button>
		</Octane.Fragment>
	</div>
}

export function SpreadFragmentObjectRef(props: { spread: { ref?: FragmentObject | null } }) @{
	<div id="spread-parent">
		<Fragment {...props.spread}>
			<button id="spread-child">{'spread'}</button>
		</Fragment>
	</div>
}

export function AliasedSpreadFragmentObjectRef(props: {
	spread: { ref?: FragmentObject | null };
}) @{
	<div id="spread-alias-parent">
		<Group {...props.spread}>
			<button id="spread-alias-child">{'spread alias'}</button>
		</Group>
	</div>
}

export function NamespacedSpreadFragmentObjectRef(props: {
	spread: { ref?: FragmentObject | null };
}) @{
	<div id="spread-namespace-parent">
		<Octane.Fragment {...props.spread}>
			<button id="spread-namespace-child">{'spread namespace'}</button>
		</Octane.Fragment>
	</div>
}

export function ExplicitThenSpreadFragmentRef(props: {
	fragRef: FragmentObject;
	spread: { ref?: FragmentObject | null };
}) @{
	<Fragment ref={props.fragRef} {...props.spread}>
		<button id="explicit-then-spread">{'explicit then spread'}</button>
	</Fragment>
}

export function SpreadThenExplicitFragmentRef(props: {
	fragRef: FragmentObject;
	spread: { ref?: FragmentObject | null };
}) @{
	<Fragment {...props.spread} ref={props.fragRef}>
		<button id="spread-then-explicit">{'spread then explicit'}</button>
	</Fragment>
}

export function OrderedFragmentSpreadEvaluation(props: {
	first: { ref?: FragmentObject | null };
	last: { ref?: FragmentObject | null };
	explicit: FragmentObject;
	observe: (label: string, value: any) => any;
}) @{
	<Fragment
		{...props.observe('first:expression', props.first)}
		ref={props.observe('explicit', props.explicit)}
		{...props.observe('last:expression', props.last)}
	>
		<button id="ordered-spread-child">{props.observe('child', 'ordered spread') as string}</button>
	</Fragment>
}

export function ReturnedNamespacedFragmentSpreadEvaluation(props: {
	first: { ref?: FragmentObject | null };
	last: { ref?: FragmentObject | null };
	explicit: FragmentObject;
	observe: (label: string, value: any) => any;
}) {
	return <Octane.Fragment
		{...props.observe('first:expression', props.first)}
		ref={props.observe('explicit', props.explicit)}
		{...props.observe('last:expression', props.last)}
	>
		<span id="returned-namespace-ordered-spread-child">{props.observe(
			'child',
			'ordered spread',
		) as string}</span>
	</Octane.Fragment>;
}

export function ReturnedAliasedFragmentObjectRef(props: { fragRef: FragmentObject }) {
	return <Group ref={props.fragRef}>
		<button id="returned-alias-child">{'returned alias'}</button>
	</Group>;
}

export function ReturnedNamespacedFragmentObjectRef(props: { fragRef: FragmentObject }) {
	return <Octane.Fragment ref={props.fragRef}>
		<button id="returned-namespace-child">{'returned namespace'}</button>
	</Octane.Fragment>;
}

function LocalRefTarget(props: { ref: HostObject }) @{
	<button id="local-ref-target" ref={props.ref}>{'local component'}</button>
}

export function ShadowedFragmentAlias(props: { fragRef: HostObject }) @{
	const Group = LocalRefTarget;
	<Group ref={props.fragRef} />
}

export function ShadowedFragmentNamespace(props: { fragRef: HostObject }) @{
	const Octane = { Fragment: LocalRefTarget };
	<Octane.Fragment ref={props.fragRef} />
}

export function ForeignFragmentAlias(props: { fragRef: FragmentObject }) @{
	<ForeignGroup {...{ ref: props.fragRef } as object} />
}

function FragmentChildPassthrough(props: { children?: unknown }) {
	return props.children;
}

export function FragmentWrappedHostChildren(props: { fragRef: FragmentObject }) @{
	<div id="wrapped-parent">
		<Fragment ref={props.fragRef}>
			<button id="wrapped-direct">{'direct'}</button>
			<FragmentChildPassthrough>
				<FragmentChildPassthrough>
					<button id="wrapped-nested">{'nested'}</button>
				</FragmentChildPassthrough>
			</FragmentChildPassthrough>
		</Fragment>
	</div>
}

// Stage 1 — callback-ref shape: the user-supplied callback gets the
// FragmentInstance directly (and `null` on unmount via attachRef).
export function FragmentCallbackRef(props: { cb: FragmentCallback }) @{
	<div id="parent">
		<Fragment ref={props.cb}>
			<div id="child">{'hi' as string}</div>
		</Fragment>
	</div>
}

export function FragmentChangingCallbackRef(props: { cb: FragmentCallback }) @{
	<div id="changing-parent">
		<Fragment ref={props.cb}>
			<div id="changing-child">{'hi'}</div>
		</Fragment>
	</div>
}

export function FragmentRenderPhaseCallbackRef(props: {
	first: FragmentCallback;
	second: FragmentCallback;
}) @{
	const [useSecond, setUseSecond] = useState(false);
	if (!useSecond) setUseSecond(true);
	<Fragment ref={useSecond ? props.second : props.first}>
		<div id="render-phase-child">{'hi'}</div>
	</Fragment>
}

// Stage 1 — fragment ref must be populated by the time useLayoutEffect
// AND useEffect run. Effects report what they saw via props callbacks
// so the test can assert without leaning on module-level mutable state.
export function FragmentEffectVisibility(props: {
	fragRef: FragmentObject;
	onLayout: FragmentCallback;
	onPassive: FragmentCallback;
}) @{
	useLayoutEffect(() => {
		props.onLayout(props.fragRef.current);
	}, []);
	useEffect(() => {
		props.onPassive(props.fragRef.current);
	}, []);
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="child">{'hi' as string}</div>
		</Fragment>
	</div>
}

export function FragmentEffectListener(props: {
	fragRef: FragmentObject;
	onClick: EventListener;
	revision: number;
}) @{
	useEffect(() => {
		const fragment = props.fragRef.current as FragmentInstance;
		fragment.addEventListener('click', props.onClick);
		return () => fragment.removeEventListener('click', props.onClick);
	}, [props.onClick, props.revision]);
	<Fragment ref={props.fragRef}>
		<button id="effect-listener-child">{'effect listener'}</button>
	</Fragment>
}
