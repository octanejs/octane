import { ErrorBoundary, Suspense, use } from 'octane';

// Regression fixtures for error/suspense unwinding through NESTED passthrough
// components and host elements (the @octanejs/router Match pipeline shape:
// boundary > passthrough > host > passthrough > leaf).

function Pass(props) @{
	<>{props.children}</>
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

// The router MatchInner shape: a component subscribed to an external store that
// SUSPENDS while the store says pending, and — without the promise ever
// resolving — STOPS suspending and returns a component subtree (with a host +
// nested @if control flow) when the store flips. The store flip re-renders the
// SUSPENDED try body via its subscription; the body must be able to mount fresh
// blocks even though the boundary had stashed the try DOM away.
import { useSyncExternalStore } from 'octane';

export interface MiniStore {
	get: () => string;
	set: (v: string) => void;
	subscribe: (cb: () => void) => () => void;
}

export function createMiniStore(initial: string): MiniStore {
	let value = initial;
	const subs = new Set<() => void>();
	return {
		get: () => value,
		set: (v: string) => {
			value = v;
			subs.forEach((cb) => cb());
		},
		subscribe: (cb: () => void) => {
			subs.add(cb);
			return () => subs.delete(cb);
		},
	};
}

function InnerContent(props) @{
	<div class="content">
		@if (props.tag === 'done') {
			<span class="done">{'done'}</span>
		} @else {
			<span class="other">{'other'}</span>
		}
	</div>
}

function StoreDriven(props) {
	const status = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
	if (status === 'pending') {
		use(props.promise);
	}
	return <InnerContent tag={status} />;
}

export function StoreFlipHost(props) @{
	<Suspense fallback={<i class="fb">{'loading'}</i>}>
		<Pass>
			<div class="wrap">
				<Pass>
					<StoreDriven store={props.store} promise={props.promise} />
				</Pass>
			</div>
		</Pass>
	</Suspense>
}
