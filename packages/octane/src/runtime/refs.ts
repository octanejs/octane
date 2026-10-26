// Refs and fragment refs
//
// Ref attach and detach queues, ref callbacks and their cleanups, and
// FragmentInstance.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './signal-owners.js';
import { __profileCount, ProfileCounter } from '../profiling.js';
import { formatClientError } from '../error-codes.client.generated.js';
import type {
	HookSlot,
	Scope,
	Block,
	StoreInst,
	RefAttach,
	SuspenseRefEntry,
	OffscreenCapture,
	UncommittedRefAttaches,
} from './types.js';
import { activityRefState, NATIVE_READ_DRIVER, queueRefAttach, noop } from './drivers.js';
import {
	ROOT_RENDER_ROLLBACK,
	journalRootProperty,
	refAttachQueue,
	attachLiveFragmentRef,
	activeFragments,
	MaximumUpdateDepthError,
	drainQueuedRefDetaches,
} from './engine.js';
import { blockIsAncestorOf } from './effects.js';
import type { PortalSlot } from './portals.js';
import { TEARDOWN_HANDLER, TEARDOWN_BLOCK } from './block.js';
import { fragmentHostVisible, findHiddenActivity } from './suspense.js';
import { TRANSITION_JOURNAL, ROOT_RENDER_TRANSACTION, WIP_CAPTURE } from './render.js';
import { nodeAfterPortalRange } from './deopt.js';
import { journalBag, REF_DETACH_SUPPRESSION } from './commit.js';
import { getNextSibling } from './templates.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

export let drainRefDetaches: typeof drainQueuedRefDetaches = noop;
export function withoutRefDetachSuppression<T>(
	_entries: SuspenseRefEntry[] | null,
	fn: () => T,
): T {
	return fn();
}

// Pending store-syncs to reconcile at the next commit (drained in commitEffects
// after runLayoutEffects). Populated at RENDER time, so — like effects — pushes
// during a captured render are redirected into WIP_CAPTURE.stores and spliced
// back only if that render commits (spliceOffscreenCapture).
export const storeSyncQueue: StoreInst<any>[] = [];

/**
 * A committed host changes its ref at commit, so its attach queues ahead of
 * every ref its render queued, which spliceOffscreenCapture appends at
 * `split`. React attaches them all in tree order: move each ref the commit
 * ops queued (from `from`) to its op's place among the render's, after those
 * queued before that op.
 */
export function placeCommitRefs(from: number, split: number): void {
	const refs = refAttachQueue;
	let write = from;
	let read = split;
	for (const moved of refs.slice(from, split)) {
		while (read < refs.length && refs[read].op <= moved.op) refs[write++] = refs[read++];
		refs[write++] = moved;
	}
}

export function createOffscreenCapture(): OffscreenCapture {
	return {
		rootTransaction: false,
		renderRoot: null,
		renderedBlocks: null,
		effects: [[], [], []],
		events: [],
		eventActions: [],
		refs: [],
		detaches: undefined,
		stores: [],
		suspenseCommits: undefined,
		renderCleanups: undefined,
	};
}

// Bound render→layout-effect→render passes without mistaking a repeated block for a loop.
export const LAYOUT_CASCADE_LIMIT = 50;

/**
 * Deferred de-opt host ref DETACHES, queued by detachDeoptTreeRefs during teardown
 * (item removal, list clear, wholesale unmount, mode-switch rebuild) and drained at
 * commit BEFORE the mount attaches — React's mutation-before-layout phasing. Flat
 * [ref, el, ref, el, …] pairs: `el` is the node the ref was attached to, so a
 * callback ref shared across elements releases the RIGHT per-element cleanup.
 * Deliberately NOT the attach queue: attaches skip disposed subtrees
 * (blockSubtreeDisposed), while a teardown detach must fire precisely BECAUSE its
 * subtree is disposed.
 */
export const refDetachQueue: any[] = [];

/**
 * Queue a teardown ref detach for commit (compiled `ref` binding / spread-ref /
 * hostComponent / fragment-ref unmount cleanups, and the de-opt teardown walk).
 * Unmount cleanups run mid-render (unmountScope), and a ref can be a setState
 * function whose value feeds back into what an owner renders — firing `ref(null)`
 * synchronously lets that null-update render before the replacement element's
 * deferred attach, oscillating forever when the teardown was a rebuild. Deferring
 * to commit puts the null and the new element in the SAME batch (React's
 * mutation→layout phasing). `el` is the element the ref was attached to, so a
 * callback ref shared across elements releases ITS element's React-19 cleanup.
 */
export function queueRefDetach(ref: any, el: Element | FragmentInstance | null): void {
	if (drainRefDetaches === noop) drainRefDetaches = drainQueuedRefDetaches;

	if (ref == null || isRefDetachSuppressed(el)) return;
	if (el !== null && NATIVE_READ_DRIVER && NATIVE_READ_DRIVER.unpublishedRef(el, ref)) {
		NATIVE_READ_DRIVER.forgetUnpublishedRef(el);
		return;
	}
	const activity = el === null || !activityRefState ? undefined : activityRefState.get(el);
	if (activity?.hidden && activity.connected !== ref) return;
	// Capture the active teardown boundary (if we're inside an unmount walk) so a
	// throwing detach at drain time routes there — React's safelyDetachRef →
	// captureCommitPhaseError (ReactErrorBoundaries:2782).
	const capture = ROOT_RENDER_TRANSACTION?.aborted && !ROOT_RENDER_ROLLBACK ? null : WIP_CAPTURE;
	const target = capture === null ? refDetachQueue : (capture.detaches ??= []);
	target.push(ref, el, TEARDOWN_HANDLER, TEARDOWN_BLOCK);
}

/** Replace a changed element/fragment ref without disturbing commit-phase ordering. */
export function replaceRef(
	scope: Scope,
	previous: any,
	next: any,
	target: Element | FragmentInstance,
): any {
	if (TRANSITION_JOURNAL !== null) {
		// The compiler stores the replacement immediately after this call. A
		// later suspension must restore both the binding and the fragment handle
		// before retrying, even when no other binding in this scope changed.
		journalBag();
		if (Object.prototype.hasOwnProperty.call(target, '_currentRef'))
			journalRootProperty(target, '_currentRef', (target as any)._currentRef);
	}
	if (previous != null) queueRefDetach(previous, target);
	if (next != null) queueRefAttach(scope, next, target);
	return next;
}

/** Detach only an own enumerable ref from the latest committed host/spread props. */
export function queueOwnRefDetach(value: any, target: Element): void {
	if (
		value != null &&
		Object.prototype.propertyIsEnumerable.call(Object(value), 'ref') &&
		value.ref != null
	) {
		queueRefDetach(value.ref, target);
	}
}

export interface RefDetachSuppression {
	elements: Set<Element | FragmentInstance>;
	parent: RefDetachSuppression | null;
}

function isRefDetachSuppressed(el: Element | FragmentInstance | null): boolean {
	if (el === null) return false;
	for (let context = REF_DETACH_SUPPRESSION; context !== null; context = context.parent) {
		if (context.elements.has(el)) return true;
	}
	return false;
}

// Callback replacement detaches and reattaches in one commit. Defer scheduling
// eager state writes until both phases finish, so null -> the same node does not
// perpetually replace an inline ref. Values themselves remain immediately visible.
export interface RefStateUpdate {
	block: Block;
	previous: unknown;
	profileSlot?: HookSlot;
}

/** True if `block` or any of its ancestors has been disposed (unmounted). */
export function blockSubtreeDisposed(block: Block | null): boolean {
	let b: Block | null = block;
	while (b !== null) {
		if (b.disposed) return true;
		b = b.parentBlock;
	}
	return false;
}

export function refAttachWasDiscarded(
	uncommitted: UncommittedRefAttaches | null,
	el: Element | FragmentInstance,
	ref: any,
): boolean {
	return uncommitted !== null && uncommitted.get(el) === ref;
}

export function discardSubtreeRefAttachesFrom(
	queue: RefAttach[],
	root: Block,
	uncommitted: UncommittedRefAttaches,
): void {
	let write = 0;
	for (let read = 0; read < queue.length; read++) {
		const entry = queue[read];
		const owner = entry.block;
		if (owner === root || (owner !== null && blockIsAncestorOf(root, owner))) {
			uncommitted.set(
				entry.el,
				entry.ref === attachLiveFragmentRef
					? (entry.el as FragmentInstance)._currentRef
					: entry.ref,
			);
			continue;
		}
		queue[write++] = entry;
	}
	queue.length = write;
}

// Apply a ref attachment. Accepts the three supported shapes:
//   - function: called with the element (or null on detach)
//   - object  : `.current` is set to the element (or null on detach)
//   - array   : each item is attached recursively. Lets multiple owners
//               observe the same node without the parent juggling refs.
//               Matches React's `ref={[a, b]}` convention.
// Called by the compiler-emitted ref binding mount + update paths and
// by the scope cleanup hook installed at mount time.
// React 19 callback-ref cleanup. A callback ref may RETURN a cleanup function; when it
// does, that cleanup runs on detach INSTEAD of calling the ref with null. React keeps
// the cleanup per ATTACH SITE, so the SAME callback ref attached to several elements
// (`ref={registerItem}` on every list row) holds one independent cleanup per element.
// We mirror that by keying cleanups per (ref, target): an outer WeakMap by the ref
// function, an inner WeakMap by the attached element/FragmentInstance. Detach sites
// pass the previously-attached target — `attachRef(ref, null, target)` — so the RIGHT
// cleanup runs (and only that one is forgotten). A targetless detach falls back to the
// most recent cleanup-producing attach, matching the old single-slot behavior for
// external callers that attach a ref once. Legacy callback refs (that return nothing)
// keep the `ref(null)` detach contract.
const refCleanups = new WeakMap<(el: any) => unknown, WeakMap<object, () => void>>();
const refLastCleanupTarget = new WeakMap<(el: any) => unknown, object>();

export interface ActivityRefState {
	connected: any;
	hidden: boolean;
}

export function attachRef(
	ref: any,
	el: Element | FragmentInstance | null,
	prevTarget?: Element | FragmentInstance | null,
): void {
	if (ref == null) return;
	const target = el ?? prevTarget;
	const activity = target == null || !activityRefState ? undefined : activityRefState.get(target);
	if (activity !== undefined) {
		if (el !== null) {
			activity.hidden = false;
			activity.connected = ref;
		} else if (prevTarget != null) {
			if (activity.hidden && activity.connected !== ref) return;
			if (activity.connected === ref) activity.connected = null;
		}
	}
	applyRefValue(ref, el, prevTarget);
}

export function applyRefValue(ref: any, el: object | null, prevTarget?: object | null): void {
	if (ref == null) return;
	if (
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__ &&
		!Array.isArray(ref)
	)
		__profileCount(el === null ? ProfileCounter.REF_DETACH : ProfileCounter.REF_ATTACH);
	if (typeof ref === 'function') {
		if (el === null) {
			// Detach: prefer the React-19 cleanup the callback returned when it was
			// attached to `prevTarget` (falling back to the latest attach's target).
			const perTarget = refCleanups.get(ref);
			const target = prevTarget ?? refLastCleanupTarget.get(ref);
			const cleanup = perTarget !== undefined && target != null ? perTarget.get(target) : undefined;
			if (cleanup !== undefined) {
				perTarget!.delete(target as object);
				if (refLastCleanupTarget.get(ref) === target) refLastCleanupTarget.delete(ref);
				cleanup();
			} else {
				ref(null);
			}
		} else {
			const cleanup = ref(el);
			if (typeof cleanup === 'function') {
				let perTarget = refCleanups.get(ref);
				if (perTarget === undefined) refCleanups.set(ref, (perTarget = new WeakMap()));
				perTarget.set(el, cleanup as () => void);
				refLastCleanupTarget.set(ref, el);
			}
		}
		return;
	}
	if (Array.isArray(ref)) {
		if (el !== null) {
			for (let i = 0; i < ref.length; i++) applyRefValue(ref[i], el, prevTarget);
			return;
		}
		// Release every owner after a cleanup failure, keeping update-depth errors fatal.
		let error: unknown;
		let failed = false;
		for (let i = 0; i < ref.length; i++) {
			try {
				applyRefValue(ref[i], el, prevTarget);
			} catch (caught) {
				if (caught instanceof MaximumUpdateDepthError) throw caught;
				if (!failed) {
					error = caught;
					failed = true;
				}
			}
		}
		if (failed) throw error;
		return;
	}
	ref.current = el;
}
// ─────────────────────────────────────────────────────────────────────────────
// Fragment refs (React canary `enableFragmentRefs` parity).
//
// `<Fragment ref={r}>...</Fragment>` populates `r.current` with a
// FragmentInstance that exposes imperative methods over the fragment's
// first-level host children. The compiler intercepts the long-form
// `<Fragment>` JSXElement when it carries a `ref` attribute, emits a
// start/end Comment marker pair around the children in the parent template,
// and binds the markers + ref expression to a `fragmentRef` binding which
// calls `mountFragmentRef` at mount time and registers a cleanup that
// detaches the ref and destroys the instance on unmount.
//
// `Fragment` is exported as a sentinel symbol so user code can write
// `import { Fragment } from 'octane'` for parity with React. The
// compiler matches on the JSX identifier 'Fragment' at the source-name
// level, so the import is currently only for TS validity — but reserving
// the symbol identity now keeps the door open for component-prop-name
// resolution later.
// ─────────────────────────────────────────────────────────────────────────────

// A portal's range can belong to a Fragment ref only once an instance exists,
// so portals register Fragment owners only after the first one, and bundles
// without Fragment refs omit that registration.
export let FRAGMENT_REFS = false;

/** Fragment ref forms (fragment-refs parity): callback, object, or arrays. */
export type FragmentRefValue =
	| ((instance: FragmentInstance | null) => void | (() => void))
	| { current: FragmentInstance | null }
	| readonly FragmentRefValue[]
	| null;

export class FragmentInstance {
	/**
	 * Sentinel that React's test suite asserts is truthy as a sanity-check
	 * that the FragmentInstance is bound to its owning Block. Named
	 * `_ownerBlock` (not React's `_fragmentFiber`) because octane uses
	 * Blocks, not fibers — same role.
	 */
	_ownerBlock: Block;
	_startMarker: Comment;
	_endMarker: Comment;
	_destroyed: boolean;
	/**
	 * Committed direct hosts and a reusable scratch set. Swapping the sets at
	 * each commit avoids allocating per render while ensuring registrations are
	 * applied only to genuinely new children.
	 */
	_children: Set<Element | Text>;
	_pendingChildren: Set<Element | Text>;
	/** Following DOM anchor -> logically owned portal ranges; allocated on demand. */
	_portalAnchors: Map<Node, Set<PortalSlot>> | null;
	/**
	 * Registry of listeners added via addEventListener, deduped by
	 * (type, listener, capture). `null` until the first addEventListener — zero
	 * listener-registry cost for fragments that never use the listener API.
	 * Stored bindings apply only when a new direct child joins the fragment.
	 */
	_listeners: Array<{
		type: string;
		listener: EventListenerOrEventListenerObject;
		/** Snapshot taken at registration, as EventTarget does; `capture` is a boolean. */
		options: FragmentListenerOptions;
		/** Drops this entry when `options.signal` aborts; detached on removal and teardown. */
		abort: () => void;
	}> | null;
	/**
	 * Observers registered via observeUsing. New direct children inherit each
	 * observer; retained children are never redundantly observed on commit.
	 */
	_observers: Set<{ observe(target: Element): void; unobserve(target: Element): void }> | null;
	/**
	 * The ref currently pointed at this instance. Held here (not captured in the
	 * mount closure) so the unmount cleanup detaches whatever ref is current AND
	 * the compiler's update path can re-point a changed `<Fragment ref={…}>`.
	 */
	_currentRef: any;

	constructor(ownerBlock: Block, startMarker: Comment, endMarker: Comment) {
		this._ownerBlock = ownerBlock;
		this._startMarker = startMarker;
		this._endMarker = endMarker;
		this._destroyed = false;
		this._children = new Set();
		this._pendingChildren = new Set();
		this._portalAnchors = null;
		this._listeners = null;
		this._observers = null;
		this._currentRef = null;
		for (const child of fragmentDirectNodes(this)) {
			this._children.add(child);
			this._attachChild(child);
		}
		FRAGMENT_REFS = true;
		activeFragments.add(this);
	}

	_destroy(): void {
		this._destroyed = true;
		activeFragments.delete(this);
		// React removes listeners and fragment handles from disappearing children,
		// but does not call observer.unobserve during deletion or fragment teardown.
		for (const child of this._children) this._detachChild(child);
		this._children.clear();
		this._pendingChildren.clear();
		this._portalAnchors?.clear();
		this._portalAnchors = null;
		if (this._listeners !== null) {
			for (const entry of this._listeners) {
				entry.options.signal?.removeEventListener('abort', entry.abort);
			}
		}
		this._listeners = null;
		this._observers = null;
	}

	/** Associate a foreign portal range with its authored following sibling. */
	_registerPortal(portal: PortalSlot, anchor: Node): void {
		if (this._destroyed) return;
		const anchors = (this._portalAnchors ??= new Map());
		let portals = anchors.get(anchor);
		if (portals === undefined) anchors.set(anchor, (portals = new Set()));
		portals.add(portal);
	}

	/** Forget a removed portal before its foreign DOM range is torn down. */
	_unregisterPortal(portal: PortalSlot, anchor: Node): void {
		const anchors = this._portalAnchors;
		const portals = anchors?.get(anchor);
		if (portals === undefined || !portals.delete(portal)) return;
		if (portals.size === 0) anchors!.delete(anchor);
		if (anchors!.size === 0) this._portalAnchors = null;
		let child: ChildNode | null = portal.start?.nextSibling ?? null;
		while (child !== null && child !== portal.end) {
			const next = getNextSibling(child);
			if (
				(child.nodeType === 1 || child.nodeType === 3) &&
				this._children.delete(child as Element | Text)
			) {
				this._detachChild(child as Element | Text);
			}
			child = next;
		}
	}

	/** Attach inherited bindings and publish this fragment's public DOM handle. */
	_attachChild(child: Element | Text): void {
		if (this._listeners !== null) {
			for (const entry of this._listeners) {
				child.addEventListener(
					entry.type,
					entry.listener,
					entry.options as AddEventListenerOptions,
				);
			}
		}
		if (child.nodeType === 1 && this._observers !== null) {
			for (const observer of this._observers) observer.observe(child as Element);
		}
		const host = child as (Element | Text) & { reactFragments?: Set<FragmentInstance> };
		(host.reactFragments ??= new Set()).add(this);
	}

	/** Remove only this fragment's registrations; nested fragment handles stay. */
	_detachChild(child: Element | Text): void {
		if (this._listeners !== null) {
			for (const entry of this._listeners) {
				child.removeEventListener(entry.type, entry.listener, entry.options);
			}
		}
		(child as (Element | Text) & { reactFragments?: Set<FragmentInstance> }).reactFragments?.delete(
			this,
		);
	}

	/**
	 * Diff current hosts after each commit. Reattaching a retained listener would
	 * revive an exhausted `{ once: true }` registration; calling observe again is
	 * also observable, so only newly inserted children inherit those bindings.
	 */
	_reapply(): void {
		if (this._destroyed) return;
		const previous = this._children;
		const current = this._pendingChildren;
		for (const child of fragmentDirectNodes(this)) {
			current.add(child);
			if (!previous.has(child)) this._attachChild(child);
		}
		for (const child of previous) {
			if (!current.has(child)) this._detachChild(child);
		}
		previous.clear();
		this._children = current;
		this._pendingChildren = previous;
	}

	// ─── focus / focusLast / blur (Stage 2) ─────────────────────────────
	/**
	 * Focus the first element for which the browser actually accepts focus.
	 * Listening for the focus event handles labels, shadow delegation, disabled
	 * controls, and programmatically focusable tabIndex=-1 elements correctly.
	 */
	focus(options?: FocusOptions): void {
		if (this._destroyed) return;
		for (const el of fragmentDescendants(this)) {
			if (focusFragmentElement(el, options)) return;
		}
	}

	/**
	 * Focus the last programmatically focusable element, trying descendants in
	 * reverse tree order until the browser accepts one.
	 */
	focusLast(options?: FocusOptions): void {
		if (this._destroyed) return;
		const descendants = Array.from(fragmentDescendants(this));
		for (let i = descendants.length - 1; i >= 0; i--) {
			if (focusFragmentElement(descendants[i], options)) return;
		}
	}

	/**
	 * Blur the focused element only when a logical fragment child owns it,
	 * including children rendered into foreign portal containers. Each child is
	 * checked against its own focus root, so shadow-root and iframe portal
	 * children resolve to the owned element rather than their host or frame.
	 */
	blur(): void {
		if (this._destroyed) return;
		for (const child of fragmentDirectChildren(this)) {
			const root = child.getRootNode() as Document | ShadowRoot;
			const active = root.activeElement;
			if (active && (child === active || child.contains(active))) {
				(active as HTMLElement).blur();
				return;
			}
		}
	}

	// ─── addEventListener / removeEventListener (Stage 3) ───────────────
	/**
	 * Attaches a listener to every first-level Element or Text child.
	 * The (type, listener, capture) tuple is stored so children inserted into
	 * the fragment later inherit the listener. Deduped by that same tuple,
	 * matching the DOM's listener identity rules.
	 *
	 * Like EventTarget, the options are copied at registration, an already
	 * aborted signal registers nothing, and aborting the signal ends the
	 * registration. The children's native listeners carry the same signal, so
	 * the browser detaches them and the abort handler only drops the entry.
	 */
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: AddEventListenerOptions | boolean,
	): void {
		if (this._destroyed) return;
		// A boolean or omitted argument has no members, so these reads are undefined.
		const given = options as AddEventListenerOptions | undefined;
		const snapshot: FragmentListenerOptions = {
			capture: listenerCapturePhase(options),
			signal: given?.signal,
			once: given?.once,
			passive: given?.passive,
		};
		if (snapshot.signal?.aborted) return;
		const listeners = (this._listeners ??= []);
		for (const e of listeners) {
			// Native abort removal runs before every abort handler, so an aborted entry
			// is already gone for an earlier handler that registers the callback again.
			if (
				e.type === type &&
				e.listener === listener &&
				e.options.capture === snapshot.capture &&
				!e.options.signal?.aborted
			) {
				return; // already registered — no-op (DOM/React dedupe)
			}
		}
		const entry: NonNullable<FragmentInstance['_listeners']>[number] = {
			type,
			listener,
			options: snapshot,
			abort: () => {
				const index = listeners.indexOf(entry);
				if (index >= 0) listeners.splice(index, 1);
			},
		};
		listeners.push(entry);
		snapshot.signal?.addEventListener('abort', entry.abort, { once: true });
		for (const child of fragmentDirectNodes(this)) {
			child.addEventListener(type, listener, snapshot as AddEventListenerOptions);
		}
	}

	/**
	 * Removes a listener previously added via this FragmentInstance. The
	 * (type, listener, options.capture) tuple must match the add call — the same
	 * identity rule EventTarget.removeEventListener uses. Detaches from the
	 * current children and stops re-applying it to future ones. Unmatched calls
	 * are a silent no-op (DOM parity).
	 */
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: AddEventListenerOptions | boolean,
	): void {
		if (this._destroyed || !this._listeners) return;
		const wantCapture = listenerCapturePhase(options);
		for (let i = this._listeners.length - 1; i >= 0; i--) {
			const entry = this._listeners[i];
			if (entry.type !== type) continue;
			if (entry.listener !== listener) continue;
			if (entry.options.capture !== wantCapture) continue;
			entry.options.signal?.removeEventListener('abort', entry.abort);
			for (const child of fragmentDirectNodes(this)) {
				child.removeEventListener(type, listener, entry.options);
			}
			this._listeners.splice(i, 1);
			return;
		}
	}

	// ─── observeUsing / unobserveUsing / getClientRects / getRootNode (Stage 4) ─
	/**
	 * Forwards .observe() on the supplied observer (IntersectionObserver,
	 * ResizeObserver, MutationObserver, or any other with an `observe(target)`
	 * signature) to every direct fragment child. Lets a single fragment ref
	 * stand in for "watch this list of siblings" — react-aria's Virtualizer
	 * and dnd-kit's drop-zone primitives are the canonical clients.
	 */
	observeUsing(observer: {
		observe(target: Element): void;
		unobserve(target: Element): void;
	}): void {
		if (this._destroyed) return;
		if (process.env.NODE_ENV !== 'production') {
			let hasText = false;
			let hasElement = false;
			for (const child of this._children) {
				if (child.nodeType === 1) {
					hasElement = true;
					break;
				}
				if (child.nodeType === 3) hasText = true;
			}
			if (hasText && !hasElement) {
				console.error(
					'observeUsing() was called on a FragmentInstance with only text children. ' +
						'Observers do not work on text nodes.',
				);
			}
		}
		if (!this._observers) this._observers = new Set();
		this._observers.add(observer);
		for (const el of fragmentDirectChildren(this)) observer.observe(el);
	}

	/**
	 * Stops observing with the given observer: unobserves the current children
	 * and stops applying it to future ones. An unregistered observer is not
	 * touched and produces React's diagnostic in development.
	 */
	unobserveUsing(observer: {
		observe(target: Element): void;
		unobserve(target: Element): void;
	}): void {
		if (this._destroyed) return;
		if (this._observers === null || !this._observers.has(observer)) {
			if (process.env.NODE_ENV !== 'production') {
				console.error(
					'You are calling unobserveUsing() with an observer that is not being observed with this fragment ' +
						'instance. First attach the observer with observeUsing()',
				);
			}
			return;
		}
		this._observers.delete(observer);
		for (const el of fragmentDirectChildren(this)) observer.unobserve(el);
	}

	/**
	 * Concatenates direct host-element and text-node rectangles in logical tree
	 * order. Text uses Range because Text does not expose getClientRects itself.
	 */
	getClientRects(): DOMRect[] {
		const out: DOMRect[] = [];
		if (this._destroyed) return out;
		for (const node of fragmentDirectNodes(this)) {
			if (node.nodeType === 3) {
				const range = node.ownerDocument.createRange();
				range.selectNodeContents(node);
				// Lightweight DOM environments do not implement Range geometry.
				if (typeof range.getClientRects !== 'function') continue;
				const rects = range.getClientRects();
				for (let i = 0; i < rects.length; i++) out.push(rects[i]);
			} else {
				const rects = (node as Element).getClientRects();
				for (let i = 0; i < rects.length; i++) out.push(rects[i]);
			}
		}
		return out;
	}

	/**
	 * Resolve the owning host parent's root, forwarding composed shadow-root
	 * options. A detached FragmentInstance is its own root, matching React.
	 */
	getRootNode(options?: GetRootNodeOptions): Node | FragmentInstance {
		if (this._destroyed) return this;
		const parent = this._startMarker.parentNode;
		return parent === null ? this : parent.getRootNode(options);
	}

	// ─── compareDocumentPosition / dispatchEvent (Stage 5) ──────────────
	/**
	 * Preserve the platform's directional/ancestor bits while returning exact
	 * CONTAINED_BY for logical children. Empty ranges have no DOM position of
	 * their own, so their derived result is IMPLEMENTATION_SPECIFIC.
	 */
	compareDocumentPosition(other: Node): number {
		if (this._destroyed) return Node.DOCUMENT_POSITION_DISCONNECTED;
		const parent = this._startMarker.parentNode;
		if (parent === null) return Node.DOCUMENT_POSITION_DISCONNECTED;

		let first: Element | Text | null = null;
		let last: Element | Text | null = null;
		for (const child of fragmentDirectNodes(this)) {
			first ??= child;
			last = child;
			if (child === other || (child.nodeType === 1 && (child as Element).contains(other))) {
				return parent.contains(child)
					? Node.DOCUMENT_POSITION_CONTAINED_BY
					: Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
			}
		}

		if (first === null || last === null) {
			// A Fragment rendered directly inside a portal has a physical parent
			// in the foreign container, but its ordering is relative to the portal's
			// authored host. Portal mounting stamps that logical host on its direct
			// children, including this Fragment's boundary comment.
			const logicalParent =
				(this._startMarker as Comment & { $$portalParent?: Node }).$$portalParent ?? parent;
			let result = logicalParent.compareDocumentPosition(other);
			if (logicalParent === other) {
				result = Node.DOCUMENT_POSITION_CONTAINS;
			} else if ((result & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0) {
				const next = fragmentNearestSibling(this._endMarker, true);
				result =
					next !== null &&
					(next === other ||
						(next.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
						? Node.DOCUMENT_POSITION_FOLLOWING
						: Node.DOCUMENT_POSITION_PRECEDING;
			}
			return result | Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
		}

		const firstResult = first.compareDocumentPosition(other);
		if ((firstResult & Node.DOCUMENT_POSITION_DISCONNECTED) !== 0) return firstResult;
		const lastResult = last.compareDocumentPosition(other);
		if (
			parent.contains(first) &&
			parent.contains(last) &&
			(firstResult & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
			(lastResult & Node.DOCUMENT_POSITION_PRECEDING) !== 0
		) {
			return Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
		}
		// A portal moves its entire Fragment outside the authored host. A node
		// still inside that host cannot have a trustworthy DOM position relative
		// to the Fragment's foreign range, so React reports a logical-tree/DOM
		// mismatch instead of leaking the foreign container's document order.
		const portalMarker = this._startMarker as Comment & {
			$$portalParent?: Node;
			$$portalSourceAnchor?: Node;
		};
		const logicalParent = portalMarker.$$portalParent;
		if (logicalParent !== undefined && logicalParent !== parent && logicalParent.contains(other)) {
			const sourceAnchor = portalMarker.$$portalSourceAnchor;
			if (sourceAnchor === undefined) return Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
			const directionMask = Node.DOCUMENT_POSITION_PRECEDING | Node.DOCUMENT_POSITION_FOLLOWING;
			const logicalDirection = sourceAnchor.compareDocumentPosition(other) & directionMask;
			if ((firstResult & directionMask) !== logicalDirection) {
				return Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
			}
		}
		return firstResult;
	}

	/**
	 * Dispatch bubbling events directly on the parent unless fragment listeners
	 * or a non-bubbling event require React's temporary fragment-local target.
	 */
	dispatchEvent(event: Event): boolean {
		if (this._destroyed) return true;
		const parent = this._startMarker.parentNode;
		if (!parent) return true;
		const listeners = this._listeners;
		if (event.bubbles && (listeners === null || listeners.length === 0)) {
			return parent.dispatchEvent(event);
		}

		const target = (parent.ownerDocument || document).createTextNode('');
		if (listeners !== null) {
			for (const entry of listeners) {
				target.addEventListener(
					entry.type,
					entry.listener,
					entry.options as AddEventListenerOptions,
				);
			}
		}
		parent.appendChild(target);
		try {
			return target.dispatchEvent(event);
		} finally {
			if (listeners !== null) {
				for (const entry of listeners) {
					target.removeEventListener(entry.type, entry.listener, entry.options);
				}
			}
			if (target.parentNode === parent) parent.removeChild(target);
		}
	}

	// ─── scrollIntoView (Stage 6) ───────────────────────────────────────
	/**
	 * Scroll every logical first-level host child so the final scroll position
	 * settles on the first child by default, or the last child for `false`.
	 * Empty fragments use their nearest sibling, then their host parent.
	 */
	scrollIntoView(alignToTop?: boolean): void {
		if (typeof alignToTop === 'object') {
			throw new Error(formatClientError(49));
		}
		if (this._destroyed) return;
		const alignStart = alignToTop !== false;
		const children = Array.from(fragmentDirectNodes(this));
		if (children.length === 0) {
			const following = fragmentNearestSibling(this._endMarker, true);
			const preceding = fragmentNearestSibling(this._startMarker, false);
			const target = alignStart
				? following || preceding || this._startMarker.parentNode
				: preceding || following;
			if (target === null || target === undefined || target.nodeType === 9) return;
			if (target.nodeType === 11) {
				const host = (target as ShadowRoot).host;
				if (host) host.scrollIntoView(alignToTop);
				return;
			}
			if (target.nodeType === 3) {
				scrollFragmentTextNode(target as Text, alignStart);
			} else {
				(target as Element).scrollIntoView(alignToTop);
			}
			return;
		}

		for (
			let index = alignStart ? children.length - 1 : 0;
			alignStart ? index >= 0 : index < children.length;
			index += alignStart ? -1 : 1
		) {
			const child = children[index];
			if (child.nodeType === 3) scrollFragmentTextNode(child as Text, alignStart);
			else (child as Element).scrollIntoView(alignToTop);
		}
	}
}

// Internal records keep one shape. Web IDL treats undefined dictionary members
// as absent; narrow only at the native listener boundary, without forcing defaults.
type FragmentListenerOptions = {
	capture: boolean;
	signal: AbortSignal | undefined;
	once: boolean | undefined;
	passive: boolean | undefined;
};

/**
 * EventTarget.removeEventListener compares on (type, listener, capture-flag).
 * Everything else (once, passive, signal) is "transparent" to identity, so
 * we normalize options down to its capture-flag for the equality test.
 */
function listenerCapturePhase(o: AddEventListenerOptions | boolean | undefined): boolean {
	if (o == null) return false;
	if (typeof o === 'boolean') return o;
	return !!o.capture;
}

/**
 * Yield first-level authored host nodes in logical order. Comment boundaries
 * are implementation details; text remains observable to fragment geometry.
 */
export function* fragmentDirectNodes(fi: FragmentInstance): Generator<Element | Text> {
	const portalAnchors = fi._portalAnchors;
	let node: ChildNode | null = getNextSibling(fi._startMarker);
	while (node !== null) {
		const next = getNextSibling(node);
		const portals = portalAnchors === null ? undefined : portalAnchors.get(node);
		if (portals !== undefined) {
			// A portal containing a Fragment ref may grow around a later independent
			// portal targeting the same container. Empty entries identify those
			// foreign ranges without changing the ordinary direct-child fast path.
			if (portals.size === 0) {
				const foreignEnd = (node as any).$$portalEnd as Node | undefined;
				if (foreignEnd !== undefined) {
					node = nodeAfterPortalRange(node, foreignEnd) as ChildNode | null;
					continue;
				}
			}
			for (const portal of portals) {
				// Portals are physically outside Activity's hidden host range. Their
				// logical Block ancestry, not their target DOM, determines visibility.
				if (portal.block === null || findHiddenActivity(portal.block) !== null) continue;
				let child: ChildNode | null = portal.start?.nextSibling ?? null;
				while (child !== null && child !== portal.end) {
					const nextChild = getNextSibling(child);
					if ((child.nodeType === 1 || child.nodeType === 3) && fragmentHostVisible(child)) {
						yield child as Element | Text;
					}
					child = nextChild;
				}
			}
		}
		if (node === fi._endMarker) return;
		if ((node.nodeType === 1 || node.nodeType === 3) && fragmentHostVisible(node)) {
			yield node as Element | Text;
		}
		node = next;
	}
}

/**
 * First-level host elements are the membership set for fragment listeners,
 * observers, and public `reactFragments` handles.
 */
function* fragmentDirectChildren(fi: FragmentInstance): Generator<Element> {
	for (const node of fragmentDirectNodes(fi)) {
		if (node.nodeType === 1) yield node as Element;
	}
}

/** Deep-walk each first-level host subtree without scanning the entire document. */
function* fragmentDescendants(fi: FragmentInstance): Generator<Element> {
	for (const top of fragmentDirectChildren(fi)) {
		yield top;
		const walker = (top.ownerDocument || document).createTreeWalker(top, 1);
		let descendant = walker.nextNode() as Element | null;
		while (descendant) {
			yield descendant;
			descendant = walker.nextNode() as Element | null;
		}
	}
}

/** Ask the DOM whether focusing succeeded, including delegated/redirected focus. */
function focusFragmentElement(node: Element, options?: FocusOptions): boolean {
	const element = node as HTMLElement;
	const owner = element.ownerDocument;
	if (owner.activeElement === element) return true;
	let focused = false;
	const onFocus = () => {
		focused = true;
	};
	owner.addEventListener('focus', onFocus, true);
	try {
		(element.focus || HTMLElement.prototype.focus).call(element, options);
	} finally {
		owner.removeEventListener('focus', onFocus, true);
	}
	return focused;
}

/** Skip implementation-only markers when locating an empty fragment's host sibling. */
function fragmentNearestSibling(marker: Node, forward: boolean): Element | Text | null {
	let sibling = forward ? getNextSibling(marker) : marker.previousSibling;
	while (sibling !== null) {
		if (sibling.nodeType === 1 || sibling.nodeType === 3) return sibling as Element | Text;
		sibling = forward ? getNextSibling(sibling) : sibling.previousSibling;
	}
	return null;
}

/** Text nodes expose geometry through Range rather than Element.scrollIntoView. */
function scrollFragmentTextNode(node: Text, alignToTop: boolean): void {
	const range = node.ownerDocument.createRange();
	range.selectNodeContents(node);
	if (typeof range.getBoundingClientRect !== 'function') return;
	const rect = range.getBoundingClientRect();
	const view = node.ownerDocument.defaultView || window;
	const y = alignToTop ? view.scrollY + rect.top : view.scrollY + rect.bottom - view.innerHeight;
	view.scrollTo(view.scrollX + rect.left, y);
}

/**
 * Compiler-emitted helper. Creates a FragmentInstance bound to the supplied
 * marker pair + owning block, attaches the user's ref, and queues both the
 * detach + the FragmentInstance destruction on the scope's cleanup chain.
 */
export function mountFragmentRef(
	scope: Scope,
	startMarker: Comment,
	endMarker: Comment,
	ref: any,
): FragmentInstance {
	const fi = new FragmentInstance(scope.block, startMarker, endMarker);
	fi._currentRef = ref;
	// Defer the attach to commit (after DOM insertion, before layout effects) so
	// the fragment's markers/children are connected when a callback ref fires —
	// same React-19 timing as element refs. A render-phase replay may re-point the
	// Fragment before this mount commit drains, so the shared trampoline resolves
	// `_currentRef` at drain/cancellation time. The structured target still lets a
	// Suspense hide distinguish this uncommitted attach from an older committed ref.
	queueRefAttach(scope, attachLiveFragmentRef, fi);
	(scope.cleanups ??= []).push(() => {
		// Detach at commit, not inline (queueRefDetach) — unmount cleanups run
		// mid-render, and a state-setter ref firing null synchronously can render
		// before a replacement's attach. The instance is destroyed now; the queued
		// attachRef only nulls/cleans the user's ref, which needs no live instance.
		queueRefDetach(fi._currentRef, fi);
		fi._destroy();
	});
	return fi;
}
