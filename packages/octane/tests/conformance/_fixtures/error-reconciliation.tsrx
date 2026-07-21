import { useLayoutEffect } from 'octane';

// Fixtures for conformance/error-reconciliation-stress.test.ts — ported from
// facebook/react packages/react-dom/src/__tests__/ReactErrorBoundaries-test.internal.js
// (React 19.2.7). The class ErrorBoundary becomes @try/@catch (OUTCOME port);
// the fallback text mirrors React's "Caught an error: <msg>." exactly so the
// textContent assertions carry over verbatim.

// Per ReactErrorBoundaries-test.internal.js:296 — Normal: renders a div with
// its children (here: a label prop).
function NormalRow(props) @{
	<div class="normal">{props.label as string}</div>
}

// Per ReactErrorBoundaries-test.internal.js:378 — BrokenRender: always throws
// "Hello" from render.
function BrokenRender() {
	throw new Error('Hello');
	// eslint-disable-next-line no-unreachable
	return null;
}

// Per ReactErrorBoundaries-test.internal.js:1997 — MaybeBrokenRender: renders
// a normal keyed row until the `fail` flag flips, then throws "Hello" from
// render. `fail` arrives as a prop (fresh each render, like React's fresh
// elements) so the row is guaranteed to re-render inside the failing pass.
function StressRow(props) @{
	if (props.item.broken && props.fail) {
		throw new Error('Hello');
	}
	<div class="row" data-k={props.item.id as number}>{props.item.label as string}</div>
}

// Per ReactErrorBoundaries-test.internal.js:1978 — "doesn't get into
// inconsistent state during reorders": ~100 keyed children plus one
// maybe-thrower, shuffled every render; the boundary must catch the mid-
// reconcile throw and leave NO orphaned/duplicated rows behind.
export function ReorderStress(props) @{
	<>
		@try {
			<div id="stress-list">
				@for (const item of props.items; key item.id) {
					<StressRow item={item} fail={props.fail} />
				}
			</div>
		} @catch (err) {
			<div class="caught">{'Caught an error: ' + err.message + '.' as string}</div>
		}
	</>
}

// Per ReactErrorBoundaries-test.internal.js:1950 — "doesn't get into
// inconsistent state during additions": boundary starts empty, then children
// (one of which throws on mount) are added in an update.
export function AdditionsCase(props) @{
	<>
		@try {
			<div id="add-wrap">
				@if (props.showChildren) {
					<>
						<NormalRow label="a" />
						<BrokenRender />
						<NormalRow label="b" />
					</>
				}
			</div>
		} @catch (err) {
			<div class="caught">{'Caught an error: ' + err.message + '.' as string}</div>
		}
	</>
}

// Per ReactErrorBoundaries-test.internal.js:263 — BrokenComponentWillUnmount
// throws "Hello" from componentWillUnmount. The octane analog is a layout-
// effect cleanup that throws when the row unmounts (cleanup-at-unmount is the
// hook-era home of will-unmount work).
function BrokenUnmountRow(props) @{
	useLayoutEffect(() => {
		return () => {
			props.log?.('BrokenUnmount cleanup [!]');
			throw new Error('Hello');
		};
	}, []);
	<div class="row">{'broken'}</div>
}

// Per ReactErrorBoundaries-test.internal.js:1927 — "doesn't get into
// inconsistent state during removals": removing children where the middle
// one throws while unmounting must land in the boundary's fallback.
export function RemovalsCase(props) @{
	<>
		@try {
			<div id="remove-wrap">
				@if (props.showChildren) {
					<>
						<NormalRow label="a" />
						<BrokenUnmountRow log={props.log} />
						<NormalRow label="b" />
					</>
				}
			</div>
		} @catch (err) {
			<div class="caught">{'Caught an error: ' + err.message + '.' as string}</div>
		}
	</>
}
