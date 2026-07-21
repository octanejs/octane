// Fixtures for conformance/refs-under-error.test.ts — ported from
// facebook/react packages/react-dom/src/__tests__/ReactErrorBoundaries-test.internal.js
// (:1158 / :1209 / :2782) and packages/react-reconciler/src/__tests__/
// ReactFiberRefs-test.js (:64), React 19.2.7. Class error boundaries become
// @try/@catch; fallback text mirrors React's "Caught an error: <msg>.".

// Per ReactErrorBoundaries-test.internal.js:378 — BrokenRender: always throws
// "Hello" from render.
function BrokenRender() {
	throw new Error('Hello');
	// eslint-disable-next-line no-unreachable
	return null;
}

// Per ReactErrorBoundaries-test.internal.js:1158/:1209 — a boundary whose try
// body carries a ref'd child div AND a sibling that throws while mounting;
// the @catch fallback carries the boundary's errorMessageRef (React's
// ErrorBoundary renders <div ref={this.props.errorMessageRef}> in its error
// state).
export function AbortedMountRefs(props) @{
	<>
		@try {
			<>
				<div class="child" ref={props.childRef} />
				<BrokenRender />
			</>
		} @catch (err) {
			<div class="error-message" ref={props.errorMessageRef}>{'Caught an error: ' + err.message +
				'.' as string}</div>
		}
	</>
}

// Per ReactErrorBoundaries-test.internal.js:2793 — LocalBrokenCallbackRef:
// renders a div whose callback ref throws when detached (called with null).
function BrokenDetachRef(props) @{
	<div class="inner-ref" ref={props.r}>{'ref'}</div>
}

// Per ReactErrorBoundaries-test.internal.js:2782 — "catches errors thrown
// while detaching refs": an outer boundary around a sibling + an INNER
// boundary holding the broken-detach child. The failing update removes the
// inner boundary subtree entirely, so the detach throw must skip the
// unmounting inner boundary and land in the still-mounted OUTER one.
export function DetachThrowApp(props) @{
	<>
		@try {
			<>
				<span class="sibling">{'sibling'}</span>
				@if (props.keepInner) {
					@try {
						<BrokenDetachRef r={props.r} />
					} @catch (err) {
						<div class="inner-fallback">{'InnerFallback'}</div>
					}
				}
			</>
		} @catch (err) {
			<div class="outer-fallback">{'OuterFallback'}</div>
		}
	</>
}

// Per ReactFiberRefs-test.js:64 — "ref is attached even if there are no other
// updates (host component)": the host element's output never changes; only
// which ref object its `ref` binding resolves to flips with `which`.
export function HostRefSwap(props) @{
	<div class="host" ref={props.which === 1 ? props.ref1 : props.ref2}>{'Hi'}</div>
}
