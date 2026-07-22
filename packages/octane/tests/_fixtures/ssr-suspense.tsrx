import { Hydrate, Suspense, use, useId, useState } from 'octane';

// SSR Phase 4 — Suspense + data serialization. The server render() awaits
// use(promise) and renders the resolved value (not the @pending fallback); the
// value is serialized into an inline <script> that the client seeds on hydrate
// so use() returns synchronously (no re-suspend, no client re-fetch).

// Bare use() with NO @try boundary — the resolved value flows straight into the
// DOM. Used for the hydration test: a bare use() has no boundary to catch a
// suspension, so the client MUST get the value from the seed.
export function AsyncLeaf(props) @{
	const value = use(props.promise);
	<div id="leaf">{value as string}</div>
}

export function DeferredAsyncLeaf(props) @{
	<Hydrate when={props.when} split={false}>
		<AsyncLeaf promise={props.promise} />
	</Hydrate>
}

function DeferredStreamedButton(props) @{
	const value = use(props.promise);
	<button
		id="deferred-stream-action"
		onClick={() => props.onClick?.(value)}
	>{value as string}</button>
}

export function DeferredStreamedSuspense(props) @{
	<Hydrate when={props.when} split={false} onHydrated={props.onHydrated}>
		<Suspense fallback={<button id="deferred-stream-action">{'Loading streamed content'}</button>}>
			<DeferredStreamedButton promise={props.promise} onClick={props.onClick} />
		</Suspense>
	</Hydrate>
}

// A use() that resolves to `undefined`. The resolved value must round-trip
// through the SSR seed as `undefined`, NOT `null` (JSON has no undefined). The
// rendered marker discriminates undefined / null / other so the hydration test
// can prove the seeded value is undefined.
export function AsyncUndef(props) @{
	const value = use(props.promise);
	<div id="undef">{(value === undefined
		? 'is-undefined'
		: value === null
			? 'is-null'
			: 'other') as string}</div>
}

// Mirrors the playground/octane-ssr App shape: a bare use() (async data
// seeded on hydrate) PLUS a useState counter with an onClick. Proves Phase 4
// data seeding composes with stateful, interactive hydration in one single-root
// component — and that a post-hydration re-render (the click) does NOT
// re-suspend the already-seeded use().
export function AsyncCounter(props) @{
	const message = use(props.promise);
	const [n, setN] = useState(0);
	<main id="ac">
		<h1>{message as string}</h1>
		<button id="ac-btn" onClick={() => setN(n + 1)}>{'count:' + n as string}</button>
	</main>
}

// @try / @pending / @catch around a use(promise). The server awaits the promise
// and renders the success arm; a rejected promise routes to @catch.
export function Boundary(props) @{
	<div id="box">
		@try {
			const value = use(props.promise);
			<span class="ok">{value as string}</span>
		} @pending {
			<span class="loading">{'loading'}</span>
		} @catch (err) {
			<span class="err">{err.message as string}</span>
		}
	</div>
}

// Rejection hydration fidelity probe. The catch arm observes both the original
// reason type and custom fields, so streamed hydration cannot silently replace
// a primitive/plain-object reason with a generic Error.
export function ReasonBoundary(props) @{
	<div id="reason-box">
		@try {
			const value = use(props.promise);
			<span class="reason-ok">{String(value) as string}</span>
		} @pending {
			<span class="reason-loading">{'loading'}</span>
		} @catch (err) {
			const kind = typeof err;
			const isObject = err !== null && (kind === 'object' || kind === 'function');
			const message =
				isObject && typeof err.message === 'string' ? err.message : String(err);
			const code =
				isObject && typeof err.code === 'string' ? err.code : '';
			props.onCatch?.(err);
			<span class="reason-error" data-kind={kind} data-code={code}>{message + ':' +
				code as string}</span>
		}
	</div>
}

// A catch arm that never inspects the reason lets opaque/revoked objects prove
// that rejection transport itself is exception-safe.
export function OpaqueReasonBoundary(props) @{
	<div id="opaque-reason-box">
		@try {
			use(props.promise);
			<span class="opaque-reason-ok">{'ok'}</span>
		} @pending {
			<span class="opaque-reason-loading">{'loading'}</span>
		} @catch (err) {
			props.onCatch?.(err);
			<span class="opaque-reason-error">{'caught'}</span>
		}
	</div>
}

// A fulfilled value deliberately shaped like the former in-band rejection
// sentinel. Hydration must treat it as ordinary user data.
export function SeedCollision(props) @{
	const value = use(props.promise);
	props.onValue?.(value);
	<div
		id="seed-collision"
		data-message={value.__octane_new_rejection__.message}
		data-undefined={String(value.__octane_new_undefined__)}
	>{value.label as string}</div>
}

// The inner boundary has no catch arm. A hydrated rejection must retain its
// private adoption signal while bubbling, then unwrap only for the outer catch.
export function NestedRejectionBoundary(props) @{
	<div id="nested-rejection">
		@try {
			@try {
				const value = use(props.promise);
				<span class="nested-ok">{String(value) as string}</span>
			} @pending {
				<span class="nested-inner-loading">{'inner'}</span>
			}
		} @pending {
			<span class="nested-outer-loading">{'outer'}</span>
		} @catch (err) {
			<span class="nested-error">{String(err) as string}</span>
		}
	</div>
}

// The inner catch deliberately rethrows the raw reason. Hydration must retain
// its private adoption token while unwinding so the outer catch can claim the
// already-rendered server range without exposing the token to user code.
export function RethrowingNestedRejectionBoundary(props) @{
	<div id="nested-rethrow-rejection">
		@try {
			@try {
				const value = use(props.promise);
				<span class="nested-rethrow-ok">{String(value) as string}</span>
			} @pending {
				<i>{'inner pending'}</i>
			} @catch (err) {
				props.onInnerCatch?.(err);
				throw err;
				<span class="nested-rethrow-never">{'never'}</span>
			}
		} @pending {
			<i>{'outer pending'}</i>
		} @catch (err) {
			props.onOuterCatch?.(err);
			<span class="nested-rethrow-error" data-code={err.code}>{err.message as string}</span>
		}
	</div>
}

// The outer streamed segment can complete while the inner boundary remains a
// template. The inner boundary must install an empty seed scope rather than
// consuming the outer segment's later seed.
function LaterStreamSeed(props) @{
	const later = use(props.promise);
	<span class="later-seed">{later as string}</span>
}

function NestedStreamSeedContent(props) @{
	<section class="outer-seed-content">
		<span class="outer-seed">{props.outer as string}</span>
		@try {
			const inner = use(props.inner);
			<span class="inner-seed">{inner as string}</span>
		} @pending {
			<span class="inner-seed-pending">{'inner pending'}</span>
		}
		<LaterStreamSeed promise={props.later} />
	</section>
}

export function NestedStreamSeedScopes(props) @{
	<div id="nested-stream-seeds">
		@try {
			const outer = use(props.outer);
			<NestedStreamSeedContent outer={outer} inner={props.inner} later={props.later} />
		} @pending {
			<span class="outer-seed-pending">{'outer pending'}</span>
		}
	</div>
}

// Streaming useId namespace probe. The root and whichever boundary arm is
// visible both allocate their first local id; the boundary's opaque stream id
// must keep those otherwise-identical counters disjoint across server output
// and hydration.
export function IdBoundary(props) @{
	const rootId = useId();
	props.onId?.('root', rootId);
	<div id="id-box" data-root-id={rootId}>
		@try {
			const value = use(props.promise);
			const contentId = useId();
			props.onId?.('content', contentId);
			<span class="id-ok" data-boundary-id={contentId}>{value as string}</span>
		} @pending {
			const pendingId = useId();
			props.onId?.('pending', pendingId);
			<span class="id-loading" data-boundary-id={pendingId}>{'loading'}</span>
		} @catch (err) {
			const catchId = useId();
			props.onId?.('catch', catchId);
			<span class="id-error" data-boundary-id={catchId}>{err.message as string}</span>
		}
	</div>
}

// Boundary + a scoped <style>. A STREAMED render flushes the deduped
// <style data-octane> tags AHEAD of the body markup in the shell, so the
// hydration container's first children are style tags — hydrateRoot must skip
// them when positioning the adoption cursor.
export function StyledBoundary(props) @{
	<div id="sbox" class="frame">
		@try {
			const value = use(props.promise);
			<span class="ok">{value as string}</span>
		} @pending {
			<span class="loading">{'loading'}</span>
		}
		<style>
			.frame {
				color: rgb(1, 2, 3);
			}
		</style>
	</div>
}

function LateStyledContent(props) @{
	<>
		<span class="late-content">{props.value as string}</span>
		<style>
			.late-content {
				color: rgb(4, 5, 6);
			}
		</style>
	</>
}

// The parent suspends BEFORE the styled child is entered, so this stylesheet
// first appears beside the resolved stream segment rather than in the shell.
export function LateStyledBoundary(props) @{
	<div id="late-sbox">
		@try {
			const value = use(props.promise);
			<LateStyledContent value={value} />
		} @pending {
			<span class="late-loading">{'loading'}</span>
		}
	</div>
}

function TransientObjectItem(props) @{
	@try {
		const value = use(props.promise);
		<span class="transient-object-ready">{value as string}</span>
	} @pending {
		<i class="transient-object-loading">loading</i>
	}
}

export function TransientObjectKeyBoundary(props) @{
	const item = {};
	<div id="transient-object-key">
		@for (const value of [item]; key value) {
			<TransientObjectItem promise={props.promise} />
		}
	</div>
}

function StableKeyReorderItem(props) @{
	@try {
		const value = use(props.promise);
		<span class="stable-key-ready" data-item={props.id}>{props.id + ':' + value}</span>
	} @pending {
		<i class="stable-key-loading" data-item={props.id}>{props.id + ':loading'}</i>
	}
}

export function StableKeyReorderBoundary(props) @{
	<div id="stable-key-reorder">
		@for (const item of props.items; key item) {
			<StableKeyReorderItem id={item.id} promise={item.promise} />
		}
	</div>
}

// Nested suspense: the outer use() must resolve before the inner @try body (and
// its own use()) is even reached — exercises the multi-pass retry loop.
export function Nested(props) @{
	<div id="outer">
		@try {
			const first = use(props.outer);
			@try {
				const second = use(props.inner);
				<span class="both">{first + ':' + second as string}</span>
			} @pending {
				<span class="inner-loading">{'inner…'}</span>
			}
		} @pending {
			<span class="outer-loading">{'outer…'}</span>
		}
	</div>
}

// Two independent sibling boundaries — both suspend in one pass, are awaited
// together, then each renders its own success arm (distinct call-site keys).
export function Siblings(props) @{
	<div id="sibs">
		@try {
			const a = use(props.a);
			<span class="a">{a as string}</span>
		} @pending {
			<span>{'a…'}</span>
		}
		@try {
			const b = use(props.b);
			<span class="b">{b as string}</span>
		} @pending {
			<span>{'b…'}</span>
		}
	</div>
}
