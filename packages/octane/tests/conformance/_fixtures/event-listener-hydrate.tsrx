// Fixture for the hydration case of conformance/event-listener.test.ts
// (ReactDOMEventListener-test.js:1176). Compiled BOTH client-side (via the vite
// plugin import) and server-side (via compile({mode:'server'}) in the test), so
// it lives in its own file. Handlers are props so the post-hydration update can
// detach them from the SAME adopted elements.
export function ScrollHydrate(props: {
	onScroll?: (e: Event) => void;
	onScrollCapture?: (e: Event) => void;
	onScrollEnd?: (e: Event) => void;
	onScrollEndCapture?: (e: Event) => void;
}) @{
	<div
		class="grand"
		onScroll={props.onScroll}
		onScrollCapture={props.onScrollCapture}
		onScrollEnd={props.onScrollEnd}
		onScrollEndCapture={props.onScrollEndCapture}
	>
		<div
			class="parent"
			onScroll={props.onScroll}
			onScrollCapture={props.onScrollCapture}
			onScrollEnd={props.onScrollEnd}
			onScrollEndCapture={props.onScrollEndCapture}
		>
			<div
				class="child"
				onScroll={props.onScroll}
				onScrollCapture={props.onScrollCapture}
				onScrollEnd={props.onScrollEnd}
				onScrollEndCapture={props.onScrollEndCapture}
			>{'c'}</div>
		</div>
	</div>
}
