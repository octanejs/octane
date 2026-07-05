// Fixtures for conformance/error-boundary-reconciliation.test.ts — ports of
// ErrorBoundaryReconciliation-test.internal.js onto @try/@catch.

// Renders fine until `props.fail` flips true, then throws on render.
function BrokenRender(props) @{
	if (props.fail) throw new Error('fail');
	<span class="inner" data-prop="BrokenRender">{'BrokenRender'}</span>
}

// Fallback renders the SAME host type (span) as the errored content.
export function SameTypeFallback(props) @{
	<div class="host">
		@try {
			<BrokenRender fail={props.fail} />
		} @catch (err) {
			<span class="inner" data-prop="ErrorBoundary">{'ErrorBoundary'}</span>
		}
	</div>
}

// Fallback renders a DIFFERENT host type (div) from the errored content.
export function DifferentTypeFallback(props) @{
	<div class="host">
		@try {
			<BrokenRender fail={props.fail} />
		} @catch (err) {
			<div class="inner" data-prop="ErrorBoundary">{'ErrorBoundary'}</div>
		}
	</div>
}
