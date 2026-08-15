// Fixture for conformance/invalid-listeners.test.ts — port of
// react-dom/src/__tests__/InvalidEventListeners-test.js. `bad` is whatever
// non-function value the test wants validated and stamped as the target's click
// slot; the ancestor handler proves Octane's guarded native dispatch walk keeps
// propagating after reporting it.
export function BadListenerTree(props: { onAnc: (e: Event) => void; bad: any }) @{
	<div class="anc" onClick={props.onAnc}>
		<div class="target" onClick={props.bad}>{'x'}</div>
	</div>
}

export function BadCaptureListenerTree(props: {
	onAnc: (e: Event) => void;
	bad: any;
}) @{
	<div class="anc" onClickCapture={props.onAnc}>
		<div class="target" onClickCapture={props.bad}>{'x'}</div>
	</div>
}

export function BadScrollListener(props: { bad: any }) @{
	<div class="target" onScroll={props.bad}>{'scroll target'}</div>
}

export function BadLoadListener(props: { bad: any }) @{
	<img class="target" onLoad={props.bad} />
}

export function ThrowingListenerTree(props: {
	onAnc: (event: Event) => void;
	onTarget: (event: Event) => void;
}) @{
	<div class="anc" onClick={props.onAnc}>
		<button class="target" onClick={props.onTarget}>{'throwing target'}</button>
	</div>
}

export function CustomListenerVariants(props: {
	upper: any;
	lower: any;
	dashed: any;
	capture: any;
}) @{
	<diagnostic-widget
		class="target"
		onCustomEvent={props.upper}
		oncustomevent={props.lower}
		oncustom-event={props.dashed}
		oncustomeventCapture={props.capture}
	/>
}
