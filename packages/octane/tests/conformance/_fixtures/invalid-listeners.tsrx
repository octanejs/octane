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
