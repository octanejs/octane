import { Fragment, useLayoutEffect, useEffect, useState } from 'octane';

type FragmentCallback = (instance: unknown) => void;
type FragmentObject = { current: unknown };

// Stage 1 — basic fragment ref attach. React parity: rendering
// `<Fragment ref={r}>` populates `r.current` with a FragmentInstance.
export function FragmentObjectRef(props: { fragRef: FragmentObject }) @{
	<div id="parent">
		<Fragment ref={props.fragRef}>
			<div id="child">{'hi' as string}</div>
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
