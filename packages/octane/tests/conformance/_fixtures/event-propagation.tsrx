// Fixtures for tests/conformance/event-propagation.test.ts — the octane port of
// react-dom/src/__tests__/ReactDOMEventPropagation-test.js (React 19.2.7).
//
// `Levels` mirrors the React file's Fixture/Outer/Inner composition collapsed
// into ONE root: outer-parent > outer > parent > target. React's original nests
// two SEPARATE ReactDOM copies (outer root + inner root) to test cross-copy
// isolation; octane is a single framework instance, so the single-root layout is
// the meaningful equivalent and the expected orders are the single-root ones.
//
// Handler props arrive via spread (`{...props.targetProps}`) so the test can
// install any `on<Event>` / `on<Event>Capture` pair — the runtime lazy-delegates
// spread-supplied handlers (runtime.ts applyProp → delegateEvents /
// delegateCaptureEvents), exactly like React's test installs handlers per event.

export function Levels(props: {
	type?: string;
	targetProps?: any;
	parentProps?: any;
	outerProps?: any;
	outerParentProps?: any;
}) @{
	<div class="outer-parent" {...props.outerParentProps}>
		<div class="outer" {...props.outerProps}>
			<div class="parent" {...props.parentProps}>
				@switch (props.type) {
					@case 'input': {
						<input class="target" {...props.targetProps} />
					}
					@case 'form': {
						<form class="target" {...props.targetProps}></form>
					}
					@case 'video': {
						<video class="target" {...props.targetProps}></video>
					}
					@case 'dialog': {
						<dialog class="target" {...props.targetProps}></dialog>
					}
					@case 'details': {
						<details class="target" {...props.targetProps}>{'d'}</details>
					}
					@case 'img': {
						<img class="target" {...props.targetProps} />
					}
					@default: {
						<div class="target" {...props.targetProps}>{'x'}</div>
					}
				}
			</div>
		</div>
	</div>
}
