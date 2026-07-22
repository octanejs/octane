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
		<div>{props.text as string}</div>
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
				<div>{use(props.promise) as string}</div>
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

// ── Parent enter/exit relay fixtures (React's enableViewTransitionParentEnterExit;
//    per-`it` citations live in the test file) ─────────────────────────────────

// :534 — nested boundary with parentExit + onParentExit inside an exiting unit.
export function ParentExitApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition exit="page-exit" onExit={props.onParentExit}>
				<div>
					<ViewTransition
						exit="nested-exit"
						onExit={props.onNestedExit}
						parentExit="nested-parent-exit"
						onParentExit={props.onParentExitNested}
					>
						<div>{'Item'}</div>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

// :582 — the enter-side mirror.
export function ParentEnterApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition enter="page-enter" onEnter={props.onParentEnter}>
				<div>
					<ViewTransition
						enter="nested-enter"
						onEnter={props.onNestedEnter}
						parentEnter="nested-parent-enter"
						onParentEnter={props.onParentEnterNested}
					>
						<div>{'Item'}</div>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

// :629 — a prop-less intermediate breaks the chain to Deep; Shallow (direct)
// still relays.
export function ChainBreakApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition exit="page-exit">
				<div>
					<ViewTransition parentExit="relay-exit">
						<div>
							<ViewTransition>
								<div>
									<ViewTransition parentExit="nested-exit" onParentExit={props.onParentExit1}>
										<div>{'Deep'}</div>
									</ViewTransition>
								</div>
							</ViewTransition>
						</div>
					</ViewTransition>
					<ViewTransition parentExit="nested-exit" onParentExit={props.onParentExit2}>
						<div>{'Shallow'}</div>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

// :685 / :739 — an intermediate whose relay class is "none" stops the chain;
// a sibling outside it still relays. `kind` picks the exit or enter shape.
export function NoneBreakExitApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition exit="page-exit">
				<div>
					<ViewTransition parentExit="none">
						<div>
							<ViewTransition parentExit="nested-exit" onParentExit={props.onDeep}>
								<div>{'Deep'}</div>
							</ViewTransition>
						</div>
					</ViewTransition>
					<ViewTransition parentExit="nested-exit" onParentExit={props.onSibling}>
						<div>{'Shallow'}</div>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

export function NoneBreakEnterApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition enter="page-enter">
				<div>
					<ViewTransition parentEnter="none">
						<div>
							<ViewTransition parentEnter="nested-enter" onParentEnter={props.onDeep}>
								<div>{'Deep'}</div>
							</ViewTransition>
						</div>
					</ViewTransition>
					<ViewTransition parentEnter="nested-enter" onParentEnter={props.onSibling}>
						<div>{'Shallow'}</div>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

// :788 — kind mismatch: the ancestor EXITS; a nested onParentEnter stays silent.
export function KindMismatchApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition exit="page-exit">
				<div>
					<ViewTransition parentExit="relay-exit">
						<ViewTransition parentEnter="nested-enter" onParentEnter={props.onParentEnter}>
							<div>{'Item'}</div>
						</ViewTransition>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

// :831 / :880 — the ancestor SHARES instead of exiting/entering: no relay.
export function ShareNoRelayApp(props) @{
	<>
		@if (props.page === 'a') {
			<ViewTransition name="hero" onShare={props.onShare}>
				<ViewTransition parentExit="child-parent-exit" onParentExit={props.onParentExit}>
					<div>{'Page A'}</div>
				</ViewTransition>
			</ViewTransition>
		} @else {
			<ViewTransition name="hero">
				<ViewTransition parentExit="child-parent-exit" onParentExit={props.onParentExit}>
					<div>{'Page B'}</div>
				</ViewTransition>
			</ViewTransition>
		}
	</>
}

export function ShareNoEnterRelayApp(props) @{
	<>
		@if (props.page === 'a') {
			<ViewTransition name="hero" onShare={props.onShare}>
				<ViewTransition parentEnter="child-parent-enter" onParentEnter={props.onParentEnter}>
					<div>{'Page A'}</div>
				</ViewTransition>
			</ViewTransition>
		} @else {
			<ViewTransition name="hero">
				<ViewTransition parentEnter="child-parent-enter" onParentEnter={props.onParentEnter}>
					<div>{'Page B'}</div>
				</ViewTransition>
			</ViewTransition>
		}
	</>
}

// :927 / :964 — the ancestor's own exit/enter resolves "none": no relay.
export function NoneAncestorExitApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition exit="none">
				<ViewTransition parentExit="nested-parent-exit" onParentExit={props.onParentExit}>
					<div>{'Item'}</div>
				</ViewTransition>
			</ViewTransition>
		}
	</>
}

export function NoneAncestorEnterApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition enter="none">
				<ViewTransition parentEnter="nested-parent-enter" onParentEnter={props.onParentEnter}>
					<div>{'Item'}</div>
				</ViewTransition>
			</ViewTransition>
		}
	</>
}

// :1002 — parentExit="auto" intermediate relays through.
export function UnstyledRelayApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition exit="page-exit">
				<div>
					<ViewTransition parentExit="auto">
						<ViewTransition parentExit="nested-exit" onParentExit={props.onParentExit}>
							<div>{'Item'}</div>
						</ViewTransition>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

// :1046 / :1092 — handler-only boundaries: the outermost has only onExit/
// onEnter; intermediates and leaves relay with handlers alone.
export function HandlerOnlyExitApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition onExit={props.onParentExit}>
				<div>
					<ViewTransition onParentExit={props.onRelayParentExit}>
						<ViewTransition onParentExit={props.onParentExitDeep}>
							<div>{'Item'}</div>
						</ViewTransition>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

export function HandlerOnlyEnterApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition onEnter={props.onParentEnter}>
				<div>
					<ViewTransition onParentEnter={props.onRelayParentEnter}>
						<ViewTransition onParentEnter={props.onParentEnterDeep}>
							<div>{'Item'}</div>
						</ViewTransition>
					</ViewTransition>
				</div>
			</ViewTransition>
		}
	</>
}

// :1135 — outermost enter="none" with a handler-only nested: no relay.
export function NoneEnterHandlerOnlyApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition enter="none">
				<ViewTransition onParentEnter={props.onParentEnter}>
					<div>{'Item'}</div>
				</ViewTransition>
			</ViewTransition>
		}
	</>
}

// :1172 — plain divs between boundaries never break the chain.
export function DivsChainApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition onEnter={props.onParentEnter}>
				<div>
					<div>
						<ViewTransition onParentEnter={props.onParentEnterNested}>
							<div>{'Item'}</div>
						</ViewTransition>
					</div>
				</div>
			</ViewTransition>
		}
	</>
}

// :1280 / :1318 — a completely prop-less ancestor still relays (its enter/exit
// resolves 'auto').
export function NoPropsAncestorEnterApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition>
				<ViewTransition parentEnter="nested-parent-enter" onParentEnter={props.onParentEnter}>
					<div>{'Item'}</div>
				</ViewTransition>
			</ViewTransition>
		}
	</>
}

export function NoPropsAncestorExitApp(props) @{
	<>
		@if (props.show) {
			<ViewTransition>
				<ViewTransition parentExit="nested-parent-exit" onParentExit={props.onParentExit}>
					<div>{'Item'}</div>
				</ViewTransition>
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
