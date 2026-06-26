import { use, useTransition, useSyncExternalStore } from 'octane';

// ---------------------------------------------------------------------------
// Repro fixtures for: a transition-HELD Suspense/@try boundary must keep the
// prior content even when its still-committed content RE-SUSPENDS at URGENT
// (async / external-store) priority.
//
// This models @octanejs/query's useSuspenseQuery: a transition changes the
// query key (transition-priority re-render → boundary holds), then the query
// observer notifies ASYNCHRONOUSLY on a macrotask AFTER octane's transition
// window has closed, so the resulting re-render (which re-suspends on the new
// in-flight fetch) is URGENT. React keeps the held content; octane (pre-fix)
// flashed the @pending fallback.
//
// The store + the wiring of the transition `start` setter are passed in via
// props so each test gets an isolated instance (no shic module state to leak
// between tests). `props.store` is a tiny external store of a single number;
// `props.bindStart(fn)` captures the boundary/child's `useTransition` setter so
// the test can drive a transition-priority value change.
// ---------------------------------------------------------------------------

// A sibling outside the @try whose own useTransition hook reflects the global
// transition pending count, so the test can assert isPending without reading
// the held (stale) subtree.
function PendingProbe() @{
	const [isPending] = useTransition();
	<span id="pending">
		{isPending ? 'pending' : 'idle'}
	</span>
}

// The child reads its value from the EXTERNAL store and use()s a promise per
// value. A store update re-renders ONLY this descendant block. Whether that
// re-render is transition- or urgent-priority depends on the caller: the test
// drives transition changes through the captured `start`, and urgent changes by
// calling `store.setUrgent` directly (which schedules an urgent render).
function Child(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	const v = use(props.promiseFor(value));
	<span id="content">
		{'content-' + v as string}
	</span>
}

export function HeldUrgentResuspend(props) @{
	<div>
		<PendingProbe />
		@try {
			<Child promiseFor={props.promiseFor} store={props.store} bindStart={props.bindStart} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// Variant where the boundary's OWN BODY (the try-body block) re-suspends: the
// store read + use() happen DIRECTLY in the try body, so a store change
// re-renders (and re-suspends) the try-BODY block itself, not a descendant.
export function HeldUrgentBodyResuspend(props) @{
	const [, start] = useTransition();
	props.bindStart(start);
	<div>
		<PendingProbe />
		@try {
			const value = useSyncExternalStore(props.store.subscribe, props.store.get);
			const v = use(props.promiseFor(value));
			<span id="content">
				{'content-' + v as string}
			</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// A FRESH urgent suspend with NO prior committed content — React shows the
// fallback. The boundary mounts directly into a suspended state.
export function FreshUrgentSuspend(props) @{
	<div>
		@try {
			const v = use(props.promiseFor(props.value));
			<span id="content">
				{'content-' + v as string}
			</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
