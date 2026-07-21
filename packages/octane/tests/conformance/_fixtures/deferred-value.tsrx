import { use, useState, useDeferredValue, Activity } from 'octane';

// Fixtures for conformance/deferred-value.test.ts — ports of
// facebook/react ReactDeferredValue-test.js (React 19.2.7). Each component
// mirrors one React fixture; the test file carries the per-`it` citations.

// Per ReactDeferredValue-test.js:108 — the input object is re-allocated every
// render, so a naive implementation would endlessly spawn deferred renders.
export function UnmemoizedObject(props) @{
	const { value: deferredValue } = useDeferredValue({ value: props.value });
	props.log('Original: ' + props.value);
	props.log('Deferred: ' + deferredValue);
	<div>
		<div id="original">{'Original: ' + props.value}</div>
		<div id="deferred">{'Deferred: ' + deferredValue}</div>
	</div>
}

// Host exposing a setter so the test can drive urgent vs transition updates.
export function UnmemoizedObjectHost(props) @{
	const [value, setValue] = useState(1);
	props.expose(setValue);
	<UnmemoizedObject value={value} log={props.log} />
}

// Per ReactDeferredValue-test.js:232/:298 — the deferred input comes from a
// render-phase useState sync against the incoming prop (React's regression
// shape: the memoized value must track NON-urgent commits too, so an urgent
// update reuses the PREVIOUS value, never the initial one).
export function RenderPhaseDeferred(props) @{
	const [value, setValue] = useState(null);
	if (value !== props.value) {
		setValue(props.value);
	}
	const deferredValue = useDeferredValue(value);
	<div>
		<div id="original">{'Original: ' + value}</div>
		<div id="deferred">{'Deferred: ' + deferredValue}</div>
	</div>
}

export function RenderPhaseDeferredHost(props) @{
	const [value, setValue] = useState(1);
	props.expose(setValue);
	<RenderPhaseDeferred value={value} />
}

// Per ReactDeferredValue-test.js:374 — `useDeferredValue(value, initialValue)`
// returns initialValue on the first render, then spawns a deferred re-render
// that swaps to the final value.
export function InitialValueApp(props) @{
	const value = useDeferredValue('Final', 'Initial');
	<span id="out">{value as string}</span>
}

// Per ReactDeferredValue-test.js:390 — mounting under a TRANSITION still
// shows initialValue first (the initial-render deferral is not skipped just
// because the mounting render is already non-urgent).
export function TransitionMountGate(props) @{
	const [show, setShow] = useState(false);
	props.expose(setShow);
	<div>
		@if (show) {
			<InitialValueApp />
		} @else {
			<span id="empty">{'empty'}</span>
		}
	</div>
}

// Per ReactDeferredValue-test.js:484 — initialValue whose consumer suspends,
// inside a Suspense boundary. `getText` is a test-side cache: stable promise
// per key, request-logged.
export function SuspenseInitialFinal(props) @{
	<>
		@try {
			const text = useDeferredValue('Final', 'Loading...');
			const value = use(props.getText(text));
			<span id="content">{value as string}</span>
		} @pending {
			<span id="fallback">{'Fallback'}</span>
		}
	</>
}

// Per ReactDeferredValue-test.js:564 — nested useDeferredValue hooks: React
// only defers the FIRST level; a hook mounted inside the spawned deferred
// render goes straight to its final value (no preview waterfall).
function WaterfallInner(props) @{
	const text = useDeferredValue('Content', 'Content Preview');
	props.log('render:' + text);
	<span id="content">{text as string}</span>
}

export function WaterfallApp(props) @{
	const showContent = useDeferredValue(true, false);
	props.log('app:' + showContent);
	<div>
		@if (showContent) {
			<WaterfallInner log={props.log} />
		} @else {
			<span id="app-preview">{'App Preview'}</span>
		}
	</div>
}

// Per ReactDeferredValue-test.js:611 — a NEW useDeferredValue instance
// (remounted via a different @if arm, React used `key`) must show ITS initial
// value even while an unrelated suspended transition is still pending.
function PreviewContent(props) @{
	<>
		@try {
			const t = useDeferredValue(props.text, 'Preview ' + props.text + '...');
			const v = use(props.getText(t));
			<span id="content">{v as string}</span>
		} @pending {
			<span id="fallback">{'...'}</span>
		}
	</>
}

export function RemountPreviewApp(props) @{
	const [text, setText] = useState('A');
	props.expose(setText);
	<div>
		@if (text === 'A') {
			<PreviewContent text="A" getText={props.getText} />
		} @else {
			<PreviewContent text="B" getText={props.getText} />
		}
	</div>
}

// Per ReactDeferredValue-test.js:746/:808/:848 — useDeferredValue WITH an
// initialValue inside an <Activity> tree. The test drives text/shouldShow
// through props.
function ActivityDeferredChild(props) @{
	const renderedText = useDeferredValue(props.text, 'Preview [' + props.text + ']');
	props.log('render:' + renderedText);
	<div id="app">{renderedText as string}</div>
}

export function ActivityDeferredContainer(props) @{
	<Activity mode={props.shouldShow ? 'visible' : 'hidden'}>
		<ActivityDeferredChild text={props.text} log={props.log} />
	</Activity>
}

// Per ReactDeferredValue-test.js:894 — same, but with NO initialValue.
function ActivityNoInitialChild(props) @{
	const renderedText = useDeferredValue(props.text);
	props.log('render:' + renderedText);
	<div id="app">{renderedText as string}</div>
}

export function ActivityNoInitialContainer(props) @{
	<Activity mode={props.shouldShow ? 'visible' : 'hidden'}>
		<ActivityNoInitialChild text={props.text} log={props.log} />
	</Activity>
}
