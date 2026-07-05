// Fixtures for conformance/browser-event-emitter.test.ts — port of
// react-dom/src/__tests__/ReactBrowserEventEmitter-test.js. The React file
// renders a GRANDPARENT > PARENT > CHILD tree and swaps per-node onClick
// listeners between renders; handlers-as-props reproduce exactly that.
export function ClickTree(props: {
	onGrand?: (e: Event) => void;
	onParent?: (e: Event) => void;
	onChild?: (e: Event) => void;
}) @{
	<div class="grand" onClick={props.onGrand}>
		<div class="parent" onClick={props.onParent}>
			<div class="child" onClick={props.onChild}>{'x'}</div>
		</div>
	</div>
}
