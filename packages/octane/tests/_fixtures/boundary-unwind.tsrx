import { ErrorBoundary, Suspense, use } from 'octane';

// Regression fixtures for error/suspense unwinding through NESTED passthrough
// components and host elements (the @octanejs/tanstack-router Match pipeline shape:
// boundary > passthrough > host > passthrough > leaf).

function Pass(props) @{
	<>
		{props.children}
	</>
}

function Thrower(props) @{
	if (props.bang) {
		throw new Error('deep-boom');
	}
	<span class="ok">{'ok'}</span>
}

// An error thrown by a leaf under passthrough components + a host element must
// reach the OUTER boundary, reporting the ORIGINAL error.
export function DeepThrowHost(props) @{
	<ErrorBoundary fallback={(e) => 'outer:' + (e as Error).message}>
		<Pass>
			<div class="wrap">
				<Pass>
					<Thrower bang={props.bang} />
				</Pass>
			</div>
		</Pass>
	</ErrorBoundary>
}

// An inner boundary whose catch branch RETHROWS (the router's CatchNotFound /
// notFound-forwarding shape) — the outer boundary must receive the error.
export function RethrowingCatch(props) @{
	<ErrorBoundary fallback={(e) => 'outer:' + (e as Error).message}>
		<Pass>
			<InnerRethrow bang={props.bang} />
		</Pass>
	</ErrorBoundary>
}

function InnerRethrow(props) @{
	@try {
		<div class="inner">
			<Thrower bang={props.bang} />
		</div>
	} @catch (err) {
		<Rethrow err={err} />
	}
}

function Rethrow(props) {
	throw props.err;
}

// A suspending leaf under passthroughs + a host, with the boundary ABOVE them:
// fallback → content swap must not corrupt DOM bookkeeping (and any teardown
// error must not escape into the resolver's caller — the router loader-pipeline
// stall shape).
function Suspender(props) @{
	const v = use(props.promise);
	<span class="v">
		{'v:' + v as string}
	</span>
}

export function DeepSuspenseHost(props) @{
	<Suspense fallback={<i class="fb">{'loading'}</i>}>
		<Pass>
			<div class="wrap">
				<Pass>
					<Suspender promise={props.promise} />
				</Pass>
			</div>
		</Pass>
	</Suspense>
}

// The router MatchInner shape: a COMMITTED component whose re-render SUSPENDS
// (fallback shows, try DOM soft-detached), then a later setState — reaching the
// hidden component directly through a captured setter, the way an event
// handler or timer would — makes it STOP suspending and return a component
// subtree (with a host + nested @if control flow). React parity: an update to
// a suspended component retries the boundary; the suspending promise never
// resolves.
import { useState } from 'octane';

function InnerContent(props) @{
	<div class="content">
		@if (props.tag === 'done') {
			<span class="done">{'done'}</span>
		} @else {
			<span class="other">{'other'}</span>
		}
	</div>
}

function StateDriven(props) {
	const [status, setStatus] = useState('done');
	props.bindSetter(setStatus);
	if (status === 'pending') {
		use(props.promise);
	}
	return <InnerContent tag={status} />;
}

export function StateFlipHost(props) @{
	<Suspense fallback={<i class="fb">{'loading'}</i>}>
		<Pass>
			<div class="wrap">
				<Pass>
					<StateDriven bindSetter={props.bindSetter} promise={props.promise} />
				</Pass>
			</div>
		</Pass>
	</Suspense>
}
