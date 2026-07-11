import { ViewTransition, use } from 'octane';

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

// Per ReactDOMViewTransition-test.js:425 — a ViewTransition around a Suspense
// boundary (@try/@pending is octane's directive form of the same tryBlock).
// The initial transition render suspends → the fallback commits under the
// wrapped flush (enter); the resolve commits the reveal through the
// controller (update on the wrapping boundary).
export function SuspenseRevealApp(props) @{
	<ViewTransition onEnter={props.onEnter}>
		<>
			@try {
				<div>
					{use(props.promise) as string}
				</div>
			} @pending {
				<div>{'Loading...'}</div>
			}
		</>
	</ViewTransition>
}

// Per ReactDOMViewTransition-test.js:472 — nested boundaries inserted/removed
// as ONE unit: only the OUTERMOST fires enter/exit; nested ones stay silent.
export function NestedUnitApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition
				exit="page-exit"
				enter="page-enter"
				onExit={props.onParentExit}
				onEnter={props.onParentEnter}
			>
				<div>
					<ViewTransition
						exit="nested-exit"
						enter="nested-enter"
						onExit={props.onNestedExit}
						onEnter={props.onNestedEnter}
					>
						<div>{'Item'}</div>
					</ViewTransition>
				</div>
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
