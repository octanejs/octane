import { useState, useEffect, useLayoutEffect, useTransition } from 'octane';

// Fixtures for conformance/error-handling-heuristics.test.ts — ports of
// ReactIncrementalErrorHandling-test.internal.js outcomes onto @try/@catch.

// A component that always throws during render (logs first when given a log fn).
function Thrower(props) @{
	if (props.log) props.log('Thrower render');
	throw new Error('Hello');
	<span class="never">{'never'}</span>
}

// Rethrows the error it was handed — the octane analog of React's "noop"
// error boundary whose componentDidCatch rethrows.
function Rethrow(props) @{
	throw props.err;
	<span class="never">{'never'}</span>
}

// ---------------------------------------------------------------------------
// Nearest HANDLING boundary selection
// ---------------------------------------------------------------------------

// Inner @try has NO @catch arm (only @pending) — it participates in the
// boundary chain but cannot handle a render error, so the error must keep
// propagating to the outer boundary.
export function NonHandlingInnerBoundary(props) @{
	<div class="app">
		@try {
			<div class="outer-ok">
				@try {
					<Thrower log={props.log} />
				} @pending {
					<span class="pending">{'pending'}</span>
				}
			</div>
		} @catch (err) {
			<span class="outer-caught">
				{'Caught an error: ' + err.message as string}
			</span>
		}
	</div>
}

// Inner @catch renders a component that rethrows the caught error — the
// analog of componentDidCatch(error) { throw error; }. The outer boundary
// must receive the ORIGINAL error.
export function RethrowingInnerBoundary(props) @{
	<div class="app">
		@try {
			<div class="outer-ok">
				@try {
					<Thrower log={props.log} />
				} @catch (err) {
					<Rethrow err={err} />
				}
			</div>
		} @catch (err) {
			<span class="outer-caught">
				{'Caught an error: ' + err.message as string}
			</span>
		}
	</div>
}

// Rethrowing @catch with NO outer boundary — the error escapes the whole
// boundary chain.
export function RethrowingOnlyBoundary(props) @{
	<div class="app">
		@try {
			<Thrower log={props.log} />
		} @catch (err) {
			<Rethrow err={err} />
		}
	</div>
}

// ---------------------------------------------------------------------------
// Error-value transparency + sibling unwind
// ---------------------------------------------------------------------------

// Throws a NON-Error value; the boundary must receive it as-is.
function ThrowsObject() @{
	throw { nonStandardMessage: 'oops' };
	<span class="never">{'never'}</span>
}

export function NonErrorCapture() @{
	<div class="app">
		@try {
			<ThrowsObject />
		} @catch (err) {
			<span class="caught">
				{'Caught an error: ' + err.nonStandardMessage as string}
			</span>
		}
	</div>
}

function Sibling(props) @{
	props.log('Sibling render');
	useEffect(() => {
		props.log('Sibling effect');
	});
	<span class="sibling">{'sibling'}</span>
}

// Thrower first, then two siblings — after the throw, the boundary swaps to
// catch; the siblings must never commit (no DOM, no effects).
export function ThrowWithSiblings(props) @{
	<div class="app">
		@try {
			<>
				<Thrower log={props.log} />
				<Sibling log={props.log} />
				<Sibling log={props.log} />
			</>
		} @catch (err) {
			<span class="caught">
				{'Caught an error: ' + err.message as string}
			</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Roots — usable after uncaught errors; multi-root isolation
// ---------------------------------------------------------------------------

export function BrokenRoot(props) @{
	if (props.fail) throw new Error('Hello');
	<span class="fine">{'fine'}</span>
}

export function OkRoot(props) @{
	<span class="ok">
		{props.label as string}
	</span>
}

export function CaughtBoundaryRoot(props) @{
	<div class="app">
		@try {
			<Thrower />
		} @catch (err) {
			<span class="caught">
				{'Caught an error: ' + err.message as string}
			</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Unmount-phase errors
// ---------------------------------------------------------------------------

function ThrowsOnCleanup(props) @{
	useEffect(() => {
		props.log('child effect');
		return () => {
			props.log('child cleanup [!]');
			throw new Error('unmount error');
		};
	}, []);
	<span class="cleanup-child">{'cleanup-child'}</span>
}

function CleanupLogger(props) @{
	useEffect(() => {
		return () => {
			props.log('sibling cleanup');
		};
	}, []);
	<span class="cleanup-sibling">{'cleanup-sibling'}</span>
}

// A boundary that is itself being unmounted must NOT catch (and must not
// render its fallback for) an error thrown by a descendant's cleanup.
export function UnmountingBoundary(props) @{
	<div class="app">
		@try {
			<>
				<ThrowsOnCleanup log={props.log} />
				<CleanupLogger log={props.log} />
			</>
		} @catch (err) {
			<span class="caught">{'should never render'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// Render-phase update in the same render as an error
// ---------------------------------------------------------------------------

function AllGood(props) @{
	const [n, setN] = useState(0);
	props.register(setN);
	<span class="child">
		{'All good:' + n as string}
	</span>
}

export function RenderPhaseUpdateWithError(props) @{
	if (props.shouldThrow) {
		// Render-phase update targeting a DIFFERENT component, then throw —
		// must not send the runtime into an error/recovery loop.
		props.fireSetState();
		props.onThrow();
		throw new Error('Oops!');
	}
	<div class="app">
		<AllGood register={props.register} />
	</div>
}

// ---------------------------------------------------------------------------
// Aborted off-screen (WIP) render discarded — transition swap that throws
// ---------------------------------------------------------------------------

function GoodA(props) @{
	useEffect(() => {
		return () => {
			props.log('A cleanup');
		};
	}, []);
	<span class="content">{'A'}</span>
}

function ThrowsOnMount(props) @{
	props.log('B render');
	useLayoutEffect(() => {
		props.log('B layout effect');
	});
	useEffect(() => {
		props.log('B passive effect');
	});
	throw new Error('Oops');
	<span class="content">{'B'}</span>
}

// Branch-swap shape: the @if arms swap under a transition, driving the
// renderBranchSlot off-screen (WIP) commit path.
export function TransitionSwapThrowBranch(props) @{
	const [showB, setShowB] = useState(false);
	const [isPending, start] = useTransition();
	<div class="app">
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		@try {
			@if (showB) {
				<ThrowsOnMount log={props.log} />
			} @else {
				<GoodA log={props.log} />
			}
		} @catch (err) {
			<span class="caught">
				{'Caught an error: ' + err.message as string}
			</span>
		}
	</div>
}

// Value-hole shape: a `{cond ? <B/> : <A/>}` child slot swaps component
// identity under a transition, driving the childSlot off-screen probe path.
export function TransitionSwapThrowValue(props) @{
	const [showB, setShowB] = useState(false);
	const [, start] = useTransition();
	<div class="app">
		<button id="go" onClick={() => start(() => setShowB(true))}>{'go'}</button>
		@try {
			<div class="host">
				{showB ? <ThrowsOnMount log={props.log} /> : <GoodA log={props.log} />}
			</div>
		} @catch (err) {
			<span class="caught">
				{'Caught an error: ' + err.message as string}
			</span>
		}
	</div>
}
