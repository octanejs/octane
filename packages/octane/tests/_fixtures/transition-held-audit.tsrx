import { use, useTransition, useSyncExternalStore, useEffect } from 'octane';

// ---------------------------------------------------------------------------
// Phase-2 adversarial fixtures for the transition-held / urgent-resuspend fix.
// Each fixture takes its external store + per-value promise registry via props
// so tests stay isolated. `props.store` is a tiny number store; a transition is
// driven through the captured `start` (props.bindStart), urgent changes via
// `store.setUrgent`.
// ---------------------------------------------------------------------------

function PendingProbe() @{
	const [isPending] = useTransition();
	<span id="pending">
		{isPending ? 'pending' : 'idle'}
	</span>
}

// ---------------------------------------------------------------------------
// (c) NESTED boundaries: an OUTER @try whose body holds an INNER @try. A
// transition re-renders the inner reader (holds the OUTER? no — the inner is the
// nearest boundary). We assert the INNER boundary owns the suspend and the
// outer is undisturbed, then an URGENT re-suspend keeps the inner held.
// ---------------------------------------------------------------------------
function InnerChild(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	const v = use(props.promiseFor(value));
	<span id="inner-content">{'inner-' + v as string}</span>
}

export function NestedHeldBoundary(props) @{
	<div>
		<PendingProbe />
		@try {
			<div id="outer-content">
				<span>outer</span>
				@try {
					<InnerChild
						promiseFor={props.promiseFor}
						store={props.store}
						bindStart={props.bindStart}
					/>
				} @pending {
					<span id="inner-fallback">{'inner-fallback'}</span>
				}
			</div>
		} @pending {
			<span id="outer-fallback">{'outer-fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// (d) ERROR while held: the descendant re-suspends under a transition (hold),
// then an URGENT re-render THROWS a real error (not a suspend). The boundary
// must route to @catch, not stay stuck holding. value<0 → throw.
// ---------------------------------------------------------------------------
function ThrowableChild(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	if (value < 0) {
		throw new Error('boom-' + -value as string);
	}
	const v = use(props.promiseFor(value));
	<span id="content">{'content-' + v as string}</span>
}

export function ErrorWhileHeld(props) @{
	<div>
		<PendingProbe />
		@try {
			<ThrowableChild
				promiseFor={props.promiseFor}
				store={props.store}
				bindStart={props.bindStart}
			/>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		} @catch (e) {
			<span id="error">{'error:' + (e.message) as string}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// (e) RAPID successive transitions: value 1 committed, then transition→2,
// transition→3, transition→4 before any resolve. Each is a transition-priority
// re-render. Must keep holding content-1 (no stale 2/3), then commit the LATEST
// resolved value cleanly. Driven entirely via `start`.
// ---------------------------------------------------------------------------
export function RapidTransitions(props) @{
	<div>
		<PendingProbe />
		@try {
			const value = useSyncExternalStore(props.store.subscribe, props.store.get);
			const v = use(props.promiseFor(value));
			<span id="content">{'content-' + v as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

// ---------------------------------------------------------------------------
// (f) EFFECT ordering: the held content's child mounts an effect on first
// commit; on the eventual resolve-commit of the new value, the effect cleanup
// fires then the new effect runs. We log mount/cleanup with the value so the
// test asserts the commit-time ordering on the held→resolved transition.
// ---------------------------------------------------------------------------
function EffectChild(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	const v = use(props.promiseFor(value));
	useEffect(() => {
		props.log('mount-' + v);
		return () => props.log('cleanup-' + v);
	}, [v]);
	<span id="content">{'content-' + v as string}</span>
}

export function EffectOrdering(props) @{
	<div>
		<PendingProbe />
		@try {
			<EffectChild
				promiseFor={props.promiseFor}
				store={props.store}
				bindStart={props.bindStart}
				log={props.log}
			/>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
