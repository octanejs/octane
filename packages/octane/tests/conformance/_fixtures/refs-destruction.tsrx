// Fixtures for conformance/refs-destruction.test.ts — ported from
// facebook/react packages/react-dom/src/__tests__/refs-destruction-test.js
// (React 19.2.7). The original's ClassComponent instance ref is adapted to a
// child function component forwarding its ref to a host element (React 19
// ref-as-prop — octane's only component-ref model).

export function InnerChild(props) @{
	<span id="inner-child" ref={props.ref} />
}

// Mirrors the original TestComponent's three shapes:
//   default    → <div><div ref/><InnerChild ref/></div>
//   destroy    → the whole subtree replaced by an empty <div/>
//   removeRef  → same structure, ref bindings resolve to null (the original
//                renders the same tree without ref attributes — octane keeps
//                the SAME template and nulls the binding, which likewise must
//                detach without rebuilding the elements)
export function TestComponent(props) @{
	<div>
		@if (props.destroy) {
			<div class="replaced" />
		} @else {
			<div>
				<div id="inner-div" ref={props.removeRef ? null : props.divRef} />
				<InnerChild ref={props.removeRef ? null : props.childRef} />
			</div>
		}
	</div>
}
