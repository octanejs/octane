import { ViewTransition } from 'octane';

// Fixtures for conformance/view-transition.test.ts — ports of facebook/react
// ReactDOMViewTransition-test.js (see the test file for per-`it` citations).
// Each mirrors one React inline App; props drive show/text via root.render.

// Per ReactDOMViewTransition-test.js:257 — a ViewTransition (with onEnter)
// mounted/unmounted behind a condition.
export function EnterApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition onEnter={props.onEnter}>
				<div>{'Hello'}</div>
			</ViewTransition>
		}
	</>
}

// Per ReactDOMViewTransition-test.js:292 — same shape, onExit.
export function ExitApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition onExit={props.onExit}>
				<div>{'Goodbye'}</div>
			</ViewTransition>
		}
	</>
}

// Per ReactDOMViewTransition-test.js:328 — content inside the boundary
// changes (the mock derives rects from textContent, so a text change is both
// a tracked mutation AND a rect change).
export function UpdateApp(props) @{
	<ViewTransition onUpdate={props.onUpdate} onEnter={props.onEnter}>
		<div>
			{props.text as string}
		</div>
	</ViewTransition>
}

// Per ReactDOMViewTransition-test.js:1215/:1247 — no props at all: the
// transition still runs (startViewTransition called), no handlers to fire.
export function PlainApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition>
				<div>{'Hello'}</div>
			</ViewTransition>
		}
	</>
}

// Per ReactDOMViewTransition-test.js:368 — two same-named boundaries swap in
// one transition (React uses key="a"/"b" remounts; distinct @if arms are
// octane's equivalent teardown+remount). onShare fires on the EXITING side.
export function ShareApp(props) @{
	<>
		@if (props.page === 'a') {
			<ViewTransition name="hero" onShare={props.onShareA} onExit={props.onExitA}>
				<div>{'Page A'}</div>
			</ViewTransition>
		} @else {
			<ViewTransition name="hero" onShare={props.onShareB} onEnter={props.onEnterB}>
				<div>{'Page B'}</div>
			</ViewTransition>
		}
	</>
}
