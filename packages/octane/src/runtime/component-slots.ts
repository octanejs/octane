// Component slots
//
// Component invocation as a Block, full and lite, memo bail-outs and context
// refresh, frontier rendering, children bodies, lazy, memo and HMR.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './diagnostics.js';
import { hydrating } from '../hydration-flag.js';
import { bumpContextEpoch, EPOCH_CELL } from '../context-epoch.js';
import { HYDRATION_RANGE_BOUNDARY } from '../constants.js';
import { hasOwnProp } from '../has-own.js';
import { resolveLazyDefaultProps as lazyResolvedProps } from '../shared-value-helpers.js';
import {
	__profileComponentSource,
	__profileQueueWork,
	__profileCaptureDiscarded,
	__profileBail,
	__profileSchedule,
} from '../profiling.js';
import { hasComponentFlags, COMPONENT_FLAG_BOUNDARY } from '../component-flags.js';
import { formatClientError } from '../error-codes.client.generated.js';
import {
	CHILDREN_BLOCK_TAG as CHILDREN_BLOCK,
	LAZY_COMPONENT_TAG as LAZY_COMPONENT,
	ELEMENT_TAG,
} from '../runtime-tags.js';
import {
	activeSynchronousSignalOwner,
	activeSignalOwnerEnvironment,
	currentExplicitSignalOwner,
} from '../signals/owner-context.js';
import { signalDocumentEnabled } from '../signals/document-owner.js';
import { profileTrackComponent } from './profile-probes.js';
import type {
	ComponentBody,
	HookSlot,
	Scope,
	SignalRetryLocation,
	OutputHandler,
	Block,
	SlotNext,
	Phase,
	OffscreenCapture,
	ElementDescriptor,
	ChildSlot,
} from './types.js';
import { NATIVE_READ_DRIVER, SIGNAL_BINDINGS_ENABLED } from './drivers.js';
import {
	type SignalInstanceKey,
	RENDERER_INVOCATION_SITE,
	SIGNAL_RETRY_LOCATIONS,
	stampSignalInstanceKey,
	renderBlock,
} from './signal-owners.js';
import { storeSyncQueue, refDetachQueue } from './refs.js';
import {
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	journalRootProperty,
	journalRootSlot,
	retireRootBlock,
	isCreatedInRootRender,
	refAttachQueue,
	scheduleRender,
	CURRENT_WARM,
	runActiveWarmPlans,
} from './engine.js';
import { INSERTION, LAYOUT, PASSIVE, effectQueues } from './effects.js';
import { ensureHooks, publishMemoEntry } from './hooks.js';
import { type TrackedThenable, SuspenseException, markWarm } from './use.js';
import {
	type Context,
	renderSharedBody,
	invalidateSharedBodyOutput,
	promoteMemoAncestry,
} from './context.js';
import { CURSOR, type HydrationCapability } from './hydration.js';
import {
	RENDER_VALID,
	createBlock,
	invalidateRender,
	recordCapturedRender,
	RETURNED_OUTPUT_SCOPE,
	setReturnedOutputOwner,
	renderReturnedValue,
	unmountBlock,
	registerSlot,
	resetHmrBlock,
} from './block.js';
import { EFFECT_RECONNECT_CONTEXT, PUBLISH_SUSPENSE_COMMIT, tryBlock } from './suspense.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	ROOT_RENDER_TRANSACTION,
	effectEventQueue,
	effectEventCommitActions,
	WIP_CAPTURE,
	discardFrontierBlock,
	reconnectBailedEffects,
} from './render.js';
import { pendingWrites } from './signal-bindings.js';
import {
	activityDescriptorDispatch,
	SCOPED_ELEMENT_PROPS,
	hasElementConfigKey,
	invalidElementTypeError,
} from './elements.js';
import { childSlot } from './child-slots.js';
import { sharesBlockBoundary, freshSlotEnd, settleFreshSlot, removeAfter } from './branches.js';
import { hostElementBody, hostStringTagBody, journalRootChildShape } from './deopt.js';
import { forEachSubtreeChild, detachDeoptTreeRefs } from './activity.js';
import { type ForSlot, removeRange } from './lists.js';
import {
	slotNext,
	slotFrontier,
	usesFrontier,
	queueSlotDeletion,
	placeAtCommit,
	queueRootDeletion,
} from './commit.js';
import { getFirstChild, getNextSibling } from './templates.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

/**
 * Programmatically provide a context value for a scope's descendants — the same
 * stamping `<Context value={…}>` performs, exposed for plain-TS
 * (non-template) components that render children and want to provide context to
 * them without authoring a `.tsrx` Provider wrapper. Call it during the component's
 * render, before rendering `children` into the same `scope`. (Used by runtime
 * component bindings — e.g. `@octanejs/motion`'s `MotionConfig` and variant
 * propagation.)
 */
export function provideContext<T>(scope: Scope, context: Context<T>, value: T): void {
	if (scope.$$ctxValues === null) scope.$$ctxValues = new Map();
	const values = scope.$$ctxValues;
	const had = values.has(context);
	const previous = had ? values.get(context) : undefined;
	if (had && Object.is(previous, value)) return;
	if (ROOT_RENDER_TRANSACTION !== null)
		journalUndo(() => {
			if (had) values.set(context, previous);
			else values.delete(context);
		});
	// Local values roll back with their screen; the global invalidation epoch
	// stays monotone so another root's committed Provider is never rewound.
	if (had) {
		// An external/older renderer's forced invalidation must stay conservative,
		// including when a local provider changes before a consumer checks it.
		context.$$providerVersion =
			context.$$providerVersion === context.$$version ? context.$$version + 1 : -1;
		context.$$version++;
		bumpContextEpoch();
	}
	values.set(context, value);
}

// Marker for compiler-generated children-block render functions. `.tsrx` lowers a component's
// element/text children (`<C><D/></C>`) to a render function `__children$N(__props, __s, __extra)`,
// while a render-prop child (`<C>{(data) => …}</C>`) is passed through RAW. Both are
// `typeof === 'function'`, so React-ecosystem code that branches on `typeof children === 'function'`
// (function-as-child / render-prop APIs) cannot tell them apart. The compiler tags the FORMER with
// this symbol so `isChildrenBlock()` can exclude it. Both this key and CHILDREN_BLOCK are
// `Symbol.for` keys so the identity survives multiple runtime copies (e.g. a binding bundled
// against its own octane); CHILDREN_BLOCK itself is shared with SSR through runtime-tags.ts.
export const CHILDREN_BODY: unique symbol = Symbol.for('octane.childrenBody') as any;
// Compiler certificate for `<Hydrate>` children: the values the body reads from
// its enclosing closure, so a dormant boundary can tell a changed capture from a
// fresh function with the same captures without calling the body.
export const CHILDREN_CAPTURES: unique symbol = Symbol.for('octane.childrenCaptures') as any;
// Compiled children render inside the component that receives them, but they
// are part of the template that authored them, as `.tsx` children evaluated by
// their parent are. markChildrenBlock records the signal owner that template
// renders in, and scopeSignalOwner links the children's owner to it. A render
// runs in an owner identity, which never retains its renderer tree. Unlike
// CHILDREN_BLOCK, the key is local to this runtime copy: another copy's owner
// belongs to another document owner, which scopeSignalOwner never links.
export const CHILDREN_SIGNAL_OWNER: unique symbol = Symbol() as any;

// Fresh captures from one authored body reuse its slots. A different compiled
// body has a different slot layout and must replace that scope. Untagged render
// functions retain their existing positional reconciliation contract.
export function sameRenderBody(previous: ComponentBody, next: ComponentBody): boolean {
	const previousBody = (previous as any)[CHILDREN_BODY];
	const nextBody = (next as any)[CHILDREN_BODY];
	return previousBody === undefined || nextBody === undefined || previousBody === nextBody;
}

/**
 * Compiler-emitted: attach markerless single-host-root metadata while a fresh
 * component function is still being initialized. The compiler only calls this
 * with an otherwise-unobserved function, so unused initializers are removable.
 * @internal
 */
export function markSingleRoot<T extends Function>(component: T): T {
	(component as any).$$singleRoot = true;
	return component;
}

/**
 * Compiler-emitted: tag a children-block render function so `isChildrenBlock` recognises it.
 * Returns the function for inline use (`{ children: markChildrenBlock(__children$N) }`).
 * @internal
 */
export function markChildrenBlock<T>(
	fn: T,
	body?: object,
	captures?: (() => readonly unknown[]) | null,
): T {
	if (typeof fn === 'function') {
		(fn as any)[CHILDREN_BLOCK] = true;
		// Keep the boolean ABI for consumers using another runtime copy. Compiled
		// client output supplies a source-body token for auto-memo or Hydrate captures.
		if (body !== undefined) (fn as any)[CHILDREN_BODY] = body;
		if (captures !== undefined) (fn as any)[CHILDREN_CAPTURES] = captures;
		if (activeSynchronousSignalOwner !== null || activeSignalOwnerEnvironment !== undefined)
			(fn as any)[CHILDREN_SIGNAL_OWNER] = currentExplicitSignalOwner();
	}
	return fn;
}

/**
 * Marks a component binding whose authored JSX children must remain inspectable
 * element descriptors. The compiler consumes the call; runtime identity is unchanged.
 */
export function descriptorChildren<T>(component: T): T {
	return component;
}

/**
 * True when `value` is a compiler-generated children-block — a component's element/text children
 * that `.tsrx` lowered to a render function — as opposed to a user render-prop function or any other
 * value. Lets a binding with a function-as-child API tell `<C>{(x) => …}</C>` (call it) apart from
 * `<C><D/></C>` (render it): `typeof children === 'function' && !isChildrenBlock(children)`.
 */
export function isChildrenBlock(value: unknown): boolean {
	return typeof value === 'function' && (value as any)[CHILDREN_BLOCK] === true;
}

/**
 * The children reaching `<Suspense>` / `<ErrorBoundary>` are rendered as the try
 * BODY — `renderBlock` invokes it as `block.body(props, scope, extra)`. The `.tsrx`
 * `{props.children}` lowering passes a render FUNCTION (callable as-is), but a
 * React-style `.tsx` parent lowers element children (`<S><Child/></S>`) to a
 * `createElement` DESCRIPTOR — a plain renderable, not a function. Normalize either
 * shape to a callable body so the try-block primitive works whichever dialect (or
 * value-position `.map`) authored the parent.
 */
export function childrenAsBody(children: unknown): ComponentBody {
	if (typeof children === 'function') return children as ComponentBody;
	return (_p, s) => {
		childSlot(s, 0, s.block.parentNode, children, s.block.endMarker);
	};
}

// A JSX boundary's children are its try body's only input. Like a compiled
// `@try`, keep one body identity and carry that input in the env tuple: a
// boundary that re-renders itself with unchanged children then retries its
// retained attempt and signal owners, instead of restarting it as new inputs.
const descriptorChildrenTryBody: ComponentBody = (_props, scope, env) => {
	childSlot(scope, 0, scope.block.parentNode, (env as [unknown])[0], scope.block.endMarker);
};

// Descriptor children remain inspectable values, but a scoped JSX descriptor
// resolves them only after its represented boundary enters its try body. Reading
// the accessor while constructing that body would move throws and suspension
// outside the boundary, recreating the eager-JSX ownership bug.
const scopedChildrenTryBody: ComponentBody = (_props, scope, env) => {
	childrenAsBody((env as [{ children: unknown }])[0].children)(undefined, scope, undefined);
};

export function childrenTryBlock(
	scope: Scope,
	props: { children: unknown },
	catchBody: ComponentBody | null,
	pendingBody: ComponentBody | null,
	propagateSuspense?: boolean,
): () => void {
	const block = scope.block;
	let body: ComponentBody;
	let env: unknown[] | undefined;
	if (SCOPED_ELEMENT_PROPS.has(props)) {
		body = scopedChildrenTryBody;
		env = [props];
	} else if (typeof props.children === 'function') {
		body = props.children as ComponentBody;
	} else {
		body = descriptorChildrenTryBody;
		env = [props.children];
	}
	return tryBlock(
		scope,
		0,
		block.parentNode,
		body,
		catchBody,
		pendingBody,
		block.endMarker,
		env,
		propagateSuspense,
	);
}

/**
 * Records which children body (function/token = compiled, 2 = descriptor) a scope last rendered, so a
 * flip can be detected. Lives in the hook map, whose Symbol keys are disjoint from the numeric
 * `slots` indices the two dialects contend over.
 */
export const CHILDREN_DIALECT_SLOT = Symbol('octane.childrenDialect') as HookSlot;

function hasResettableHmrRange(block: Block): boolean {
	const start = (block as { startMarker?: Node | null }).startMarker;
	const end = (block as { endMarker?: Node | null }).endMarker;
	// componentSlotLite exposes only an insertion context, not an owned Block
	// range. Decline that handoff so the bundler reloads instead of mutating the
	// parent Block through the lite scope's compatibility cast.
	if (start === undefined || end === undefined) return false;
	if (start === null || end === null) {
		return (
			start === null && end === null && (block.kind === 'root' || block.exclusiveMarkers === true)
		);
	}
	if (start !== end) {
		return start.parentNode === block.parentNode && end.parentNode === block.parentNode;
	}
	// A sole-root control-flow or list-item ancestor can borrow this exact node.
	// Promoting only the hot block would leave the borrowed boundary detached.
	for (let parent = block.parentBlock; parent !== null; parent = parent.parentBlock) {
		if (parent.startMarker === start && parent.endMarker === end) return false;
	}
	return start.parentNode === block.parentNode;
}

/** Hot blocks whose outgoing output their re-render's commit removes (clearHmrRange). */
const HMR_CLEARS = new WeakSet<Block>();

/**
 * Remove a hot block's outgoing output as its re-render starts: at that
 * render's commit, before the incoming output lands, so the edited component
 * keeps showing until then. An exclusively owned self-marked root gets a
 * private range around it, which the incoming output fills.
 */
function clearHmrRange(block: Block): void {
	const parent = block.parentNode;
	const start = block.startMarker;
	const staged = ROOT_RENDER_TRANSACTION !== null && pendingWrites(block) !== null;
	if (start !== null && start === block.endMarker) {
		const rangeStart = document.createComment('hmr');
		const rangeEnd = document.createComment('/hmr');
		if (staged) {
			placeAtCommit(parent, rangeStart, start);
			placeAtCommit(parent, rangeEnd, getNextSibling(start));
			queueRootDeletion(null, start, start);
		} else {
			parent.insertBefore(rangeStart, start);
			parent.replaceChild(rangeEnd, start);
		}
		journalRootProperty(block, 'startMarker', start);
		journalRootProperty(block, 'endMarker', start);
		block.startMarker = rangeStart;
		block.endMarker = rangeEnd;
		block.exclusiveMarkers = false;
		return;
	}
	const end = block.endMarker;
	const first = start !== null ? getNextSibling(start) : getFirstChild(parent);
	if (!staged) removeRange(first, end);
	else if (first !== end)
		queueRootDeletion(null, first, end === null ? parent.lastChild : end.previousSibling);
}

export function memoPublish<T>(slot: HookSlot, value: T, ...deps: any[]): T {
	return publishMemoEntry(CURRENT_SCOPE!, slot, deps, value);
}

export function memoPublishAlways<T>(slot: HookSlot, value: T): T {
	return publishMemoEntry(CURRENT_SCOPE!, slot, undefined, value);
}

// ---------------------------------------------------------------------------
// lazy — React's code-splitting component wrapper.
// ---------------------------------------------------------------------------

const LAZY_BODY_CHECK = Symbol.for('octane.lazyBodyCheck');
type LazyBodyCheck = (scope: Scope) => boolean;

function markLazyBodyCheck(body: ComponentBody<any>, check: LazyBodyCheck): void {
	// Static-hoisting HOCs must not inherit the wrapped lazy's ownership check.
	Object.defineProperty(body, LAZY_BODY_CHECK, {
		get() {
			return this === body ? check : undefined;
		},
	});
}

/**
 * Resolve a lazy module payload to its component. Accepts React's canonical
 * `{ default: Component }` (a dynamic `import()` namespace) and — as a
 * pragmatic extension — a bare component function, so `lazy(() =>
 * import('./x').then((m) => m.Named))` works without a `{ default }` shim.
 */
function resolveLazyModule(mod: any): ComponentBody<any> {
	let comp = mod;
	if (mod != null) {
		const defaultExport = mod.default;
		if (defaultExport !== undefined) comp = defaultExport;
	}
	if (typeof comp !== 'function' || (comp as any)[LAZY_COMPONENT] === true) {
		throw new Error(
			formatClientError(
				10,
				(comp as any)?.[LAZY_COMPONENT] === true ? 'lazy component' : typeof comp,
			),
		);
	}
	return comp as ComponentBody<any>;
}

/**
 * React's `lazy(load)` — code-splitting. Returns a component; the first time it
 * renders it calls `load()` (once, cached on the payload for every mount of this
 * lazy component) and SUSPENDS on the returned promise, exactly like a body that
 * opens with `use(loadPromise)`: the nearest `@try`/`<Suspense>` shows its
 * pending arm and retries when the module settles. Once fulfilled it tail-calls
 * the loaded component with the same `(props, scope, extra)`, so hooks, context,
 * children, and return-based bodies all behave as if the component were imported
 * statically. A rejected load throws the rejection reason on retry, routing to
 * the nearest `@catch` (React parity).
 *
 * The wrapper's identity is stable, so `componentSlot`'s `comp !==
 * state.currentComp` check never spuriously remounts, and `memo(lazy(...))`
 * composes (memoWrapper tail-calls this wrapper). The wrapper carries no
 * `$$singleRoot` flag — a value-position lazy mounts through childSlot's
 * marked path, which is correct for any root shape the loaded module may have.
 */
/* @__NO_SIDE_EFFECTS__ */
export function lazy<C extends ComponentBody<any>>(
	load: () => PromiseLike<{ default: C } | C>,
): C & { displayName?: string } {
	let status:
		'uninitialized' | 'pending' | 'fulfilled' | 'rejected' | 'fulfilled-error' | 'rejected-error' =
		'uninitialized';
	let result: any = null; // fulfilled → module value; rejected → the reason
	let initializationError: any;
	let thenable: TrackedThenable<any> | null = null;
	let profiledComponent: ComponentBody<any> | null = null;
	let memoMetadataInstalled = false;
	let displayName: string | undefined;
	let resolvedName = 'Lazy';
	let lazyWrapper!: ComponentBody<any>;
	// A wrapper may own many mounted scopes. Remember each scope's accepted
	// module body separately so another mount cannot hide a body handoff.
	const bodySlot = Symbol();

	const initializeLazy = (): void => {
		if (status !== 'uninitialized') return;
		try {
			const p = load();
			thenable = p as TrackedThenable<any>;
			p.then(
				(mod: any) => {
					// This handler was attached FIRST, so by the time the boundary's retry
					// listener fires the payload is already fulfilled/rejected and the
					// re-render takes the synchronous branch above.
					if (status === 'uninitialized' || status === 'pending') {
						result = mod;
						status = 'fulfilled';
					}
				},
				(err: any) => {
					if (status === 'uninitialized' || status === 'pending') {
						result = err;
						status = 'rejected';
					}
				},
			);
		} catch (error) {
			// React does not publish Pending until both load() and `.then(...)`
			// registration return. A synchronous throw is therefore retryable on the
			// next render instead of poisoning the wrapper with a null thenable.
			if (status === 'uninitialized') thenable = null;
			else if (CURRENT_WARM) {
				// A thenable may settle synchronously and then throw. Speculative
				// warming catches that throw, so replay it on the first real render
				// before exposing the already-settled payload on a later retry.
				initializationError = error;
				status = status === 'fulfilled' ? 'fulfilled-error' : 'rejected-error';
			}
			throw error;
		}
		if (status === 'uninitialized') status = 'pending';
	};

	const callResolvedComponent = (props: any, scope: Scope, extra: any): unknown => {
		// Keep the module object, rather than only its current `.default` value. A
		// throwing/accessor default export is a render-time failure in React: a later
		// render reads it again without re-running the loader.
		const comp = resolveLazyModule(result);
		const previousBody = scope.hooks?.get(bodySlot) as ComponentBody<any> | undefined;
		if (previousBody !== comp) {
			if (previousBody !== undefined) invalidateSharedBodyOutput(scope);
			const hooks = ensureHooks(scope);
			if (TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK) {
				journalUndo(() => {
					if (previousBody === undefined) hooks.delete(bodySlot);
					else hooks.set(bodySlot, previousBody);
				});
			}
			hooks.set(bodySlot, comp);
		}
		resolvedName = (comp as any).displayName || comp.name || 'Lazy';
		if ((comp as any).__memo === true) {
			// The lazy wrapper owns the live Block, so a resolved memo wrapper would
			// otherwise be tail-called below the place where componentSlot performs its
			// bailout. Publish equivalent metadata on this wrapper once the module has
			// resolved. The comparator resolves defaultProps at the same public boundary
			// as the component invocation.
			if (!memoMetadataInstalled) {
				Object.defineProperty(lazyWrapper, '__memo', {
					get() {
						return this === lazyWrapper;
					},
				});
				Object.defineProperty(lazyWrapper, '__compare', {
					value: (prev: any, next: any, renderScope: Scope): boolean => {
						const current = resolveLazyModule(result);
						// Equal props cannot reuse a different module body's output. This
						// check belongs to the mounted scope, not the shared lazy payload.
						if (renderScope.hooks?.get(bodySlot) !== current || (current as any).__memo !== true)
							return false;
						const compare = (current as any).__compare as
							((previous: any, incoming: any) => boolean) | undefined;
						const previous = lazyResolvedProps(current, prev);
						const incoming = lazyResolvedProps(current, next);
						return compare
							? (current as any)[LAZY_BODY_CHECK] !== undefined
								? (compare as (prev: any, next: any, scope: Scope) => boolean)(
										previous,
										incoming,
										renderScope,
									)
								: compare(previous, incoming)
							: shallowEqualProps(previous, incoming);
					},
				});
				memoMetadataInstalled = true;
			}
			// The Block was created while the payload was unresolved, before it could
			// inherit memo metadata. Arm context dependency stamping before executing
			// the resolved memo body.
			if (!scope.block.memoInChain) promoteMemoAncestry(scope);
		}
		if (
			profiledComponent !== comp &&
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__
		) {
			__profileComponentSource(lazyWrapper, comp);
			profiledComponent = comp;
		}
		return renderSharedBody(comp, lazyResolvedProps(comp, props), scope, extra);
	};

	lazyWrapper = (props: any, scope: Scope, extra: any): unknown => {
		if (status === 'fulfilled') {
			return callResolvedComponent(props, scope, extra);
		}
		if (status === 'rejected') throw result;
		if (status === 'fulfilled-error' || status === 'rejected-error') {
			status = status === 'fulfilled-error' ? 'fulfilled' : 'rejected';
			const error = initializationError;
			initializationError = undefined;
			throw error;
		}
		if (status === 'uninitialized') {
			initializeLazy();
			// PromiseLike is permitted to settle while `then` is registering. Match
			// React's synchronous-thenable contract: render or throw immediately rather
			// than briefly committing a fallback (or leaving partial sibling work).
			const settledStatus = status as 'pending' | 'fulfilled' | 'rejected';
			if (settledStatus === 'fulfilled') {
				return callResolvedComponent(props, scope, extra);
			}
			if (settledStatus === 'rejected') throw result;
		}
		// A lazy module can be the first suspension in an authored subtree.
		// Activate its ancestor plans so independent sibling imports start now.
		runActiveWarmPlans();
		throw new SuspenseException(thenable!);
	};
	// Existing ancestor warm plans can start an independently reachable module,
	// but resolution, component execution, and deferred hydration remain lazy.
	markWarm(lazyWrapper, initializeLazy);
	markLazyBodyCheck(lazyWrapper, (scope) => {
		// Checking a bailout never starts the loader or accepts speculative output.
		if (status !== 'fulfilled') return false;
		const current = resolveLazyModule(result);
		if (scope.hooks?.get(bodySlot) !== current) return false;
		// Direct lazy -> lazy is invalid, but lazy -> memo -> lazy is supported.
		const nestedCheck = (current as any)[LAZY_BODY_CHECK] as LazyBodyCheck | undefined;
		return nestedCheck === undefined || nestedCheck(scope);
	});
	Object.defineProperty(lazyWrapper, LAZY_COMPONENT, {
		get() {
			return this === lazyWrapper;
		},
	});
	Object.defineProperty(lazyWrapper, 'displayName', {
		configurable: true,
		get: () => displayName ?? resolvedName,
		set: (value: string | undefined) => {
			displayName = value;
		},
	});
	return lazyWrapper as unknown as C & { displayName?: string };
}

// ---------------------------------------------------------------------------
// Component slot — JSX `<Foo>` / `<Context>` invocation as a Block
// ---------------------------------------------------------------------------

export interface CompSlot {
	__kind: 'componentSlotSlot';
	// Null on the client `singleRoot` path: the component's single root element
	// self-delimits (block.startMarker === block.endMarker === that element), so
	// no `comp`/`/comp` markers are minted. Non-null otherwise (and always after
	// hydration, which adopts the server's range).
	start: Comment | null;
	end: Comment | null;
	/** singleRoot client mount: insert anchor for the self-marked element. */
	anchor: Node | null;
	singleRoot: boolean;
	/**
	 * M3 inherit-range (docs/comment-marker-elision-plan.md): start/end are
	 * BORROWED from the parent block — the call site is the sole root of its
	 * `@{}` body, so the body block's range IS this slot's range (both null =
	 * whole-container mode under a root / owns-parent parent). The slot never
	 * owns markers: teardown sweeps between them (block.exclusiveMarkers) or
	 * clears the container; identity swaps re-render in place; transitions take
	 * the probe path (a marker-pair WIP commit would change the parent's
	 * shape); hydration adopts NOTHING (the server skipped the frame pair).
	 */
	inherited: boolean;
	block: Block | null;
	// The component identity last rendered: a ComponentBody, or a host tag STRING
	// (a dynamic JSX tag that resolved to e.g. 'h1' — see the string-comp branch
	// in componentSlot). Compared with `!==` either way, so 'h1'→'h1' updates in
	// place while 'h1'→'h2' / string↔function flips tear down and remount.
	currentComp: ComponentBody | string | null;
	// Last-render `key` value. Sentinel `NO_KEY` when the slot was created
	// without a key arg, or when the prior render didn't supply one — so a
	// first render with `key=undefined` followed by a subsequent render with
	// `key=undefined` doesn't spuriously remount. Other keys use JSX's string
	// coercion, so numeric and equivalent string keys share one identity.
	prevKey: any;
	/** The call site supplied `key=`, even when its current value is undefined. */
	keyed: boolean;
	/** Pending structure in the open root render (SlotNext). */
	next: SlotNext | null;
}

const NO_KEY: unique symbol = Symbol('NO_KEY');

/**
 * Generic component call site: reconcile any JavaScript return value.
 *
 * Compiled call sites pass the optional tail in descending frequency — the
 * invocation identity (every compiled site), anchor, singleRoot, inherit, then
 * the rare keyed pair — and omit trailing `undefined` arguments, so the common
 * call is `componentSlot(s, i, parent, Comp, props, site, anchor)`. Keep this
 * order shared with componentSlotVoid and componentSlotLite: presentation
 * hydration (presentationStructure) reads the anchor at the same index for all
 * three writers.
 */
export function componentSlot(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	comp: ComponentBody | string,
	props: any,
	invocationSite?: string,
	anchor?: Node | null,
	singleRoot?: boolean | 2,
	inherit?: boolean,
	key?: any,
	hasKey?: boolean,
): void {
	const dispatch = activityDescriptorDispatch;
	const activity = dispatch !== null && (comp as unknown) === dispatch.type;
	if (!activity && typeof comp !== 'function' && typeof comp !== 'string') {
		throw invalidElementTypeError(comp);
	}
	// Dynamic JSX tags can resolve to a host STRING at runtime. Keep this
	// descriptor/de-opt capability in the generic entry point: compiler-proven
	// void component calls can then retain the function-only core without also
	// retaining hostStringTagBody, generic attributes, or return reconciliation.
	const body = activity
		? dispatch!.body
		: typeof comp === 'string'
			? (hostStringTagBody as unknown as ComponentBody)
			: comp;
	if (activity) {
		// A runtime-selected sentinel cannot advertise compiler boundary flags.
		// Keep its ordinary component frame symmetric with the server wrapper.
		singleRoot = false;
		inherit = false;
		if (!hasKey && key === undefined && hasElementConfigKey(props)) {
			key = props.key;
			hasKey = true;
		}
	}
	const renderProps =
		typeof comp === 'string'
			? ({
					$$kind: ELEMENT_TAG,
					type: comp,
					props,
					key: null,
					ref: props != null && props.ref !== undefined ? props.ref : null,
					children: props != null ? props.children : null,
				} satisfies ElementDescriptor)
			: props;
	componentSlotImpl(
		renderReturnedValue,
		parentScope,
		slotKey,
		domParent,
		body,
		comp,
		props,
		renderProps,
		anchor,
		key,
		singleRoot,
		inherit,
		hasKey,
		// A dynamic tag that resolved to a host renders inline on the server.
		typeof comp === 'string' ? RENDERER_INVOCATION_SITE : invocationSite,
	);
}

/** Compiler-proven `@{}` component call site: the body has no value return. */
export function componentSlotVoid(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	comp: ComponentBody | string,
	props: any,
	invocationSite?: string,
	anchor?: Node | null,
	singleRoot?: boolean | 2,
	inherit?: boolean,
	key?: any,
	hasKey?: boolean,
): void {
	if (typeof comp !== 'function') throw invalidElementTypeError(comp);
	componentSlotImpl(
		null,
		parentScope,
		slotKey,
		domParent,
		comp,
		comp,
		props,
		props,
		anchor,
		key,
		singleRoot,
		inherit,
		hasKey,
		invocationSite,
	);
}

function rejectCompiledReturn(_block: Block, _out: unknown, reset?: true): void {
	if (reset !== true) {
		throw new TypeError(formatClientError(346));
	}
}

/**
 * Render a dynamically selected compiled component under the current owner.
 * Use an ordinary dynamic JSX tag when the body can return a renderable.
 */
export type CompiledComponent<P = Record<string, never>> = (props: P) => unknown;

export function CompiledOutlet<P>(
	props: { component: CompiledComponent<P>; props: P },
	scope: Scope,
): void {
	const comp = props.component as ComponentBody<P>;
	if (typeof comp !== 'function') {
		throw new TypeError(formatClientError(346));
	}
	const block = scope.block;
	componentSlotImpl(
		rejectCompiledReturn,
		scope,
		0,
		block.parentNode,
		comp,
		comp,
		props.props,
		props.props,
		block.endMarker,
	);
}

/**
 * Mount/update a component invoked from JSX. Each invocation creates a Block
 * (so hooks/effects are scoped properly). If the component identity changes
 * across renders (dynamic-component / element-type swap), the old Block is
 * torn down and a fresh one mounted in its place. When a `key` arg is
 * supplied and its canonical string value changes between renders, the slot also
 * tears down + remounts — matches React's key-driven identity reset: useState
 * resets, useEffect cleanups fire, refs null out, the subtree gets a fresh
 * Block with a fresh hook bag.
 */
export function componentSlotImpl(
	outputHandler: OutputHandler | null,
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	// The executable render body is always a function. The generic entry point
	// maps a host string to hostStringTagBody before entering this shared core.
	body: ComponentBody,
	// Reconciliation identity. Generic dynamic tags retain their host string;
	// ordinary and compiler-proven void calls pass the component function.
	identity: ComponentBody | string,
	props: any,
	renderProps: any,
	anchor?: Node | null,
	key?: any,
	// true = the compiler PROVED the callee renders one element (same-module
	// analysis); 2 = the call site qualifies syntactically (bare identifier, no
	// key/spread/children) but the callee is cross-module — elide iff the
	// callee carries the compiler's `$$singleRoot` definition-site stamp
	// (docs/comment-marker-elision-plan.md M1).
	singleRoot?: boolean | 2,
	// M3 inherit-range: the call site is the SOLE root of its `@{}` body —
	// borrow the parent block's marker range instead of minting/adopting; the
	// server skipped the child's frame pair at this site (inheritSoleCompRoot
	// in the compiler stamps both sides from the same AST). Declined at
	// runtime when the parent block has no coherent borrowable regime.
	inherit?: boolean,
	// Compiler call-site bit: unlike the key value, this distinguishes an
	// explicit `key={undefined}` from an unkeyed call.
	hasKey?: boolean,
	// Compiler-stable component invocation identity. Unlike traversal order, this
	// survives SSR fallback-only branches and out-of-order sibling completion.
	invocationSite?: string,
): void {
	// Attribute expressions can schedule a self-update after the compiled
	// setup checkpoint. Skip their discarded child before it owns any state.
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	if (slotKey === 0 && parentScope !== RETURNED_OUTPUT_SCOPE) {
		const state = parentScope.slots[0] as any;
		if (state?.returnedOutput === true) {
			if (state.__kind === 'componentSlotSlot') {
				setReturnedOutputOwner(state, false);
			} else {
				const block = parentScope.block;
				block.outputHandler!(block, null, true);
				if (block.disposed) return;
			}
		}
	}
	const parentBlock = parentScope.block;
	if (
		parentScope.slots[slotKey] === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		parentBlock.createdStamp !== ROOT_RENDER_TRANSACTION.createdStamp
	) {
		const end = freshSlotEnd(parentBlock, domParent, anchor);
		if (end !== null) {
			try {
				// A sole root mints its own pair there: the range it would borrow is
				// committed, and the client renders it the same either way.
				componentSlotImpl(
					outputHandler,
					parentScope,
					slotKey,
					end.parentNode!,
					body,
					identity,
					props,
					renderProps,
					end,
					key,
					singleRoot,
					false,
					hasKey,
					invocationSite,
				);
			} finally {
				settleFreshSlot(parentScope, end, anchor);
			}
			return;
		}
	}
	const hydration = hydrating ? CURSOR : null;
	let state = parentScope.slots[slotKey] as CompSlot | undefined;
	// This call adopted the server's range for the component's frame.
	let adoptedFrame = false;
	if (state === undefined) {
		let start: Comment | null = null;
		let end: Comment | null = null;
		let inherited = false;
		const rangeBoundary =
			hydration !== null
				? (
						identity as ComponentBody & {
							[HYDRATION_RANGE_BOUNDARY]?: 'passthrough' | 'owner';
						}
					)[HYDRATION_RANGE_BOUNDARY]
				: undefined;
		const hydrationPassthrough = hydration?.passthroughRanges === true;
		const hydrationTransparent = hydrationPassthrough && rangeBoundary !== 'owner';
		if (hydrationPassthrough && rangeBoundary === 'owner') {
			hydration!.passthroughRanges = false;
		}
		// M3 inherit-range: borrow the parent block's range — this site is the
		// sole root of its body, so the body block's range IS the slot's range.
		// Resolved BEFORE the hydration probes: the server emitted NO frame pair
		// here, and cursor-probing would misadopt the child's own first content
		// marker. Borrow only a coherent regime — a real Block (LiteBlockImpl
		// carries no startMarker) whose markers are BOTH comments (a marked
		// range) or BOTH null (root / owns-parent whole-container). Anything
		// else declines into the regular regimes below; declines are
		// compile-time unreachable under hydration (bodies with an inherit root
		// are stamped lite-ineligible, and element-marked singleRoot parents
		// can't own a noTemplate body).
		// Boundary builtins decline through their component capability bit (covers
		// member/aliased/dynamic
		// tags the compile-time name check can't see — `<octane.Suspense>`,
		// `const S = Suspense`): their pairs are load-bearing for streaming.
		// ssrComponent reads the same bit, so the server emitted a
		// pair exactly where this falls through to the adoption regimes below.
		if (
			!hydrationTransparent &&
			inherit === true &&
			hasComponentFlags(identity, COMPONENT_FLAG_BOUNDARY)
		) {
			inherit = false;
		}
		if (hydrationTransparent) {
			inherited = true;
		} else if (inherit === true && parentBlock !== null) {
			const ps = (parentBlock as { startMarker?: Node | null }).startMarker;
			const pe = (parentBlock as { endMarker?: Node | null }).endMarker;
			if (ps != null && pe != null && ps !== pe && ps.nodeType === 8 && pe.nodeType === 8) {
				start = ps as Comment;
				end = pe as Comment;
				inherited = true;
			} else if (ps === null && pe === null) {
				// Whole-container mode: the parent block owns everything under
				// `domParent` (a root block, or an owns-parent childSlot block).
				inherited = true;
			}
		}
		// The server frames every call that does not inherit its parent's range
		// (protocol 3), so the call adopts the range at its anchor, or, appended or
		// as the sole hole of an arm, the one at the cursor. Anything else is a
		// structural mismatch (callOpen), which may defer: the call then renders
		// on the client, detached.
		const open =
			inherited || hydration === null
				? null
				: hydration.callOpen(anchor ?? null, domParent, parentScope, slotKey);
		if (open === null && !inherited && hydration !== null) {
			suspendFreshComponent(
				hydration,
				outputHandler,
				parentScope,
				slotKey,
				hydration.detachedHost(domParent),
				body,
				identity,
				props,
				renderProps,
				null,
				key,
				singleRoot,
				inherit,
				hasKey,
				invocationSite,
			);
			return;
		}
		if (inherited) {
			// Borrowed range resolved above; hydration adopts NOTHING — the cursor
			// already sits on this component's first content node.
		} else if (open !== null) {
			// Its comments become our markers, and the cursor moves to its content.
			start = open;
			end = hydration!.close(start);
			if (parentBlock === hydration!.rootBlock) hydration!.rootClaimed = true;
			hydration!.node = getNextSibling(start);
			// A passthrough root's owner adopts whatever range the server rendered
			// first in the container, so its own output need not fill that range.
			adoptedFrame = !hydrationPassthrough;
		} else if (
			singleRoot === true ||
			(singleRoot === 2 && (identity as any).$$singleRoot === true)
		) {
			// Client singleRoot: NO markers — the component's single root element
			// self-delimits (set as block.startMarker/endMarker after render below).
			// The `2` form resolves cross-module callees by their definition-site
			// stamp; a string tag or unstamped component falls through to markers.
			start = null;
			end = null;
		} else {
			start = document.createComment('comp');
			end = document.createComment('/comp');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (e.g. when this slot lives in a multi-root template
			// and must sit before its enclosing block's endMarker).
			domParent.insertBefore(start, anchor ?? null);
			domParent.insertBefore(end, anchor ?? null);
		}
		state = {
			__kind: 'componentSlotSlot',
			start,
			end,
			anchor: anchor ?? null,
			singleRoot: start === null && !inherited,
			inherited,
			block: null,
			currentComp: null,
			prevKey: NO_KEY,
			keyed: hasKey === true || key !== undefined,
			next: null,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	const nextKey = key === undefined ? NO_KEY : '' + key;
	const keyChanged = nextKey !== state.prevKey;
	const replacing = identity !== state.currentComp || keyChanged;
	const journaledSlot = ROOT_RENDER_TRANSACTION !== null && state.block !== null && replacing;
	const frontier = journaledSlot && usesFrontier(parentBlock, domParent);
	if (journaledSlot) journalRootSlot(state);
	if ((hasKey === true || key !== undefined) && !state.keyed) {
		if (!journaledSlot) journalRootProperty(state, 'keyed', state.keyed);
		state.keyed = true;
	}
	// Key-driven remount: when the compiler emitted a key arg AND its value
	// changed since last render, force `comp !== state.currentComp` semantics
	// even if the component identity is unchanged. Null out currentComp so the
	// existing tear-down branch below fires; prevKey is updated after so we
	// don't loop on the same key. Adding or removing an optional key replaces
	// the subtree too; repeated keyless renders retain the NO_KEY identity.
	if (keyChanged) {
		state.currentComp = null;
	}
	if (!journaledSlot && !Object.is(state.prevKey, nextKey))
		journalRootProperty(state, 'prevKey', state.prevKey);
	state.prevKey = nextKey;
	if (replacing) {
		// Retained instances already carry their original invocation stamp. Only
		// replacement/new Blocks need a recipe for later owner activation.
		const signalInstanceKey =
			SIGNAL_BINDINGS_ENABLED || signalDocumentEnabled
				? { parentScope, invocationSite, key, hasKey: key != null }
				: undefined;
		const retryLocation =
			state.block === null ||
			!state.block.mounted ||
			parentBlock.idState.renderOwner?.signalOwner === undefined
				? undefined
				: {
						parent: parentScope,
						slot: slotKey,
						kind: state.__kind,
						branch: undefined,
						component: identity,
						key: nextKey,
					};
		if (frontier) {
			swapComponentFrontier(
				state,
				parentBlock,
				domParent,
				body,
				identity,
				renderProps,
				outputHandler,
				signalInstanceKey,
				retryLocation,
			);
			return;
		}
		// Hydrating, an update that replaces the component this slot already
		// rendered, as a suspended deferred boundary's retry does after its
		// captures changed. The server never rendered the replacement, and the
		// cursor belongs to other slots' server nodes, so it builds as a client
		// update would.
		const replaced = hydration !== null && state.block !== null;
		if (state.block) {
			if (state.inherited) {
				// Borrowed range (M3): the markers belong to the PARENT block —
				// unmountBlock sweeps BETWEEN them (the block was created with
				// exclusiveMarkers=true) and leaves them in place; whole-container
				// mode (null markers) clears the container the parent owns (the
				// root-block precedent — unmountBlock removes no DOM for a
				// null-marker dynamic block). Never mint replacements: the remount
				// below re-renders into the same borrowed range.
				unmountBlock(state.block);
				if (parentBlock.disposed) return;
				if (state.start === null) {
					while (getFirstChild(domParent)) domParent.removeChild(getFirstChild(domParent)!);
				}
			} else if (state.singleRoot) {
				// Self-marked block — unmountBlock removes exactly the root element
				// (block.startMarker === endMarker === it); nothing to recreate.
				unmountBlock(state.block);
				if (parentBlock.disposed) return;
			} else {
				// The slot's `state.start`/`state.end` markers ARE the previous block's
				// range, so unmountBlock removes them along with the inner DOM. Capture
				// the position just outside the slot (the node that came AFTER our end
				// marker) so we can re-create fresh markers at the same logical
				// location for the new comp to mount into. `after` may be `null` when
				// the slot was at the end of `domParent` — insertBefore treats it as
				// appendChild.
				const after = getNextSibling(state.end!);
				unmountBlock(state.block);
				if (parentBlock.disposed) return;
				const newStart = document.createComment('comp');
				const newEnd = document.createComment('/comp');
				domParent.insertBefore(newStart, after);
				domParent.insertBefore(newEnd, after);
				state.start = newStart;
				state.end = newEnd;
			}
		}
		state.currentComp = identity;
		if (state.singleRoot) {
			// Client singleRoot self-mark (mirrors mountItem): render with
			// endMarker = the slot's anchor, then promote the inserted root element
			// to be the block's own start === end so teardown removes exactly it.
			// The `finally` matters because a single-root component can still SUSPEND
			// or THROW during render (e.g. `use(rejectedPromise)`): then it inserts
			// nothing, so we leave start/end null and unmountBlock no-ops for it
			// (rather than capturing a stale sibling).
			const before = state.anchor ? state.anchor.previousSibling : domParent.lastChild;
			const b = createBlock(
				'dynamic',
				parentBlock,
				domParent,
				null,
				state.anchor,
				body,
				renderProps,
				undefined,
				outputHandler,
			);
			if (signalInstanceKey !== undefined) stampSignalInstanceKey(b, signalInstanceKey);
			if (
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
				__OCTANE_PROFILE_ENABLED__ &&
				typeof identity === 'function'
			)
				profileTrackComponent(b, identity);
			state.block = b;
			try {
				if (replaced) hydration!.renderUpdate(b);
				else renderBlock(b);
			} finally {
				const last = state.anchor ? state.anchor.previousSibling : domParent.lastChild;
				if (last !== null && last !== before) {
					b.startMarker = last;
					b.endMarker = last;
				}
			}
		} else {
			const b = createBlock(
				'dynamic',
				parentBlock,
				domParent,
				state.start,
				state.end,
				body,
				renderProps,
				undefined,
				outputHandler,
			);
			if (signalInstanceKey !== undefined) stampSignalInstanceKey(b, signalInstanceKey);
			if (
				typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
				__OCTANE_PROFILE_ENABLED__ &&
				typeof identity === 'function'
			)
				profileTrackComponent(b, identity);
			// Borrowed range (M3): teardown must sweep BETWEEN the parent's
			// markers, never remove them (the branch-block precedent).
			if (state.inherited) b.exclusiveMarkers = true;
			state.block = b;
			// The server may have rendered more in the frame, for another component.
			if (adoptedFrame) hydration!.renderClaimed(b, parentScope, slotKey);
			else if (replaced) hydration!.renderUpdate(b);
			else renderBlock(b);
		}
	} else if (state.block) {
		// `memo(Component)` — skip the body when new props shallow-equal the
		// committed props (React.memo's contract; see tryMemoBail). A string comp
		// is never memo-wrapped, so it falls through to the re-render below.
		if (tryMemoBail(state.block, identity, props)) return;
		if (state.block.props !== renderProps)
			journalRootProperty(state.block, 'props', state.block.props);
		state.block.props = renderProps;
		renderBlock(state.block);
	}
	// Hydration: advance the cursor PAST this component's adopted range so the next
	// sibling adopts from the right node. The body itself doesn't reliably leave the
	// cursor at the end — an EMPTY component (`<></>`, e.g. the router's
	// <Transitioner/>) renders nothing, so without this the cursor stays parked on
	// the component's own `<!--]-->` and the following sibling desyncs. Every
	// slot parks this way, forBlock and tryBlock included. An INHERITED slot
	// adopted nothing: its end is the PARENT's marker and it has no following
	// sibling (sole root) — leave the cursor where the body put it.
	if (hydration !== null && !state.inherited && state.end !== null)
		hydration.parkPast(state.end, parentScope);
}

// Keep the fresh-subtree callback out of componentSlotImpl: a closure there
// captures every parameter, so each mount and update would allocate a context.
function suspendFreshComponent(
	hydration: HydrationCapability,
	outputHandler: OutputHandler | null,
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	body: ComponentBody,
	identity: ComponentBody | string,
	props: any,
	renderProps: any,
	anchor: Node | null | undefined,
	key: any,
	singleRoot: boolean | 2 | undefined,
	inherit: boolean | undefined,
	hasKey: boolean | undefined,
	invocationSite: string | undefined,
): void {
	hydration.suspend(() =>
		componentSlotImpl(
			outputHandler,
			parentScope,
			slotKey,
			domParent,
			body,
			identity,
			props,
			renderProps,
			anchor,
			key,
			singleRoot,
			inherit,
			hasKey,
			invocationSite,
		),
	);
}

// `true`/`false`/`null`/`undefined` render as empty (React parity); everything
// else stringifies. Text-node `.data` is literal, so no HTML escaping here (that
// is only the server's concern, where output is serialized into markup).
export function coerceChildText(v: unknown): string {
	return v == null || v === false || v === true ? '' : String(v);
}

// ---------------------------------------------------------------------------
// Frontier rendering (#2043): a slot that replaces committed content renders
// the incoming subtree into its pending fragment, never into live DOM. The
// commit deletes the outgoing range and inserts the fragment in its place; a
// render that never commits leaves the committed content exactly as it was.
// ---------------------------------------------------------------------------

/**
 * Render a slot's incoming Block between a fresh pair at the end of its
 * frontier fragment (slotFrontier). A throw discards the Block, whose nodes
 * never left the fragment, and the slot keeps what it had.
 */
export function renderFrontierBlock(
	frag: DocumentFragment,
	parentBlock: Block,
	label: string,
	body: ComponentBody,
	props: any,
	outputHandler: OutputHandler | null,
	implicitBail: boolean,
	signalInstanceKey?: SignalInstanceKey,
	retryLocation?: SignalRetryLocation,
): Block {
	const start = document.createComment(label);
	const end = document.createComment('/' + label);
	frag.append(start, end);
	const block = createBlock(
		'dynamic',
		parentBlock,
		frag,
		start,
		end,
		body,
		props,
		undefined,
		outputHandler,
	);
	if (signalInstanceKey !== undefined) stampSignalInstanceKey(block, signalInstanceKey);
	if (retryLocation !== undefined) SIGNAL_RETRY_LOCATIONS.set(block, retryLocation);
	if (implicitBail) {
		block.$$implicitBail = true;
		block.memoInChain = true;
	}
	if (
		typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
		__OCTANE_PROFILE_ENABLED__ &&
		body !== (hostStringTagBody as unknown as ComponentBody) &&
		body !== (hostElementBody as unknown as ComponentBody)
	)
		profileTrackComponent(block, body);
	try {
		renderBlock(block);
	} catch (error) {
		discardFrontierBlock(block, parentBlock, error, retryLocation);
		removeAfter(frag, start.previousSibling, null);
		throw error;
	}
	return block;
}

/**
 * A component replacement in a root render over committed DOM (usesFrontier):
 * the incoming Block renders between a fresh pair in the slot's fragment, and
 * its commit deletes the outgoing range and inserts the pair in its place.
 */
function swapComponentFrontier(
	state: CompSlot,
	parentBlock: Block,
	domParent: Node,
	body: ComponentBody,
	identity: ComponentBody | string,
	renderProps: any,
	outputHandler: OutputHandler | null,
	signalInstanceKey: SignalInstanceKey | undefined,
	retryLocation: SignalRetryLocation | undefined,
): void {
	const old = state.block!;
	// A fresh Block is an earlier replacement's in this render, in the fragment.
	const fresh = isCreatedInRootRender(ROOT_RENDER_TRANSACTION!, old);
	const inherited = state.inherited;
	const oldStart = old.startMarker;
	const oldEnd = old.endMarker;
	let first: Node | null = null;
	let last: Node | null = null;
	let before: Node | null;
	if (fresh) before = state.next!.before;
	else if (inherited) {
		// Borrowed parent markers stay; only the content between them leaves.
		first = state.start === null ? getFirstChild(domParent) : getNextSibling(state.start);
		if (first === state.end) first = null;
		else last = state.end === null ? domParent.lastChild : state.end.previousSibling;
		before = state.end;
	} else {
		first = state.start ?? oldStart;
		last = state.end ?? oldEnd;
		if (first === null) {
			before = state.anchor;
			last = null;
		} else before = getNextSibling(last!);
	}
	const frag = slotFrontier(state, parentBlock, domParent, before);
	const block = renderFrontierBlock(
		frag,
		parentBlock,
		'comp',
		body,
		renderProps,
		outputHandler,
		false,
		signalInstanceKey,
		retryLocation,
	);
	if (fresh) unmountBlock(old);
	else queueSlotDeletion(state, old, first, last);
	if (parentBlock.disposed) return;
	state.start = block.startMarker as Comment;
	state.end = block.endMarker as Comment;
	state.singleRoot = false;
	state.inherited = false;
	state.block = block;
	state.currentComp = identity;
	const pending = state.next!;
	if (!fresh && !inherited && first !== null) {
		pending.follows = true;
		if (sharesBlockBoundary(parentBlock, oldStart, oldEnd))
			pending.bound = [parentBlock, oldStart, oldEnd, null, null];
	}
	if (pending.bound !== null) {
		pending.bound[3] = state.start;
		pending.bound[4] = state.end;
	}
}

// Splice a committed capture's effects/refs/store-syncs back into the live queues (or
// the enclosing capture) so the surrounding commit drains them, child-first.

export function spliceOffscreenCapture(
	capture: OffscreenCapture,
	deferredNativeAcceptance = false,
): void {
	if (capture.presentations !== undefined && WIP_CAPTURE !== null)
		(WIP_CAPTURE.presentations ??= []).push(...capture.presentations);
	// A staged root has queued native acceptance but has not published it yet.
	// Keep that candidate on its original capture for the publication guard;
	// there is no enclosing speculative capture to transfer it into here.
	if (NATIVE_READ_DRIVER && (WIP_CAPTURE !== null || !deferredNativeAcceptance))
		NATIVE_READ_DRIVER.spliceCapture(capture, WIP_CAPTURE);
	const rendered = capture.renderedBlocks;
	capture.renderedBlocks = null;
	capture.renderRoot = null;
	if (rendered !== null && WIP_CAPTURE !== null) {
		// An inner success is still speculative until its enclosing capture commits.
		for (const block of rendered) recordCapturedRender(WIP_CAPTURE, block);
	}
	for (let p = 0 as Phase; p < 3; p++) {
		const src = capture.effects[p];
		const target = WIP_CAPTURE !== null ? WIP_CAPTURE.effects[p] : effectQueues[p];
		for (let i = 0; i < src.length; i++) {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileQueueWork(src[i]);
			target.push(src[i]);
		}
	}
	const eventTarget = WIP_CAPTURE !== null ? WIP_CAPTURE.events : effectEventQueue;
	for (let i = 0; i < capture.events.length; i++) {
		eventTarget.push(capture.events[i]);
	}
	const eventActionTarget =
		WIP_CAPTURE !== null ? WIP_CAPTURE.eventActions : effectEventCommitActions;
	for (let i = 0; i < capture.eventActions.length; i++) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileQueueWork(capture.eventActions[i]);
		eventActionTarget.push(capture.eventActions[i]);
	}
	const refTarget = WIP_CAPTURE !== null ? WIP_CAPTURE.refs : refAttachQueue;
	for (let i = 0; i < capture.refs.length; i++) refTarget.push(capture.refs[i]);
	if (capture.detaches !== undefined) {
		const target = WIP_CAPTURE === null ? refDetachQueue : (WIP_CAPTURE.detaches ??= []);
		for (const entry of capture.detaches) target.push(entry);
	}
	// Store-syncs enqueued off-screen now belong to committed DOM — hand them to the
	// live queue so the surrounding commit's drainStoreSyncs reconciles them.
	const storeTarget = WIP_CAPTURE !== null ? WIP_CAPTURE.stores : storeSyncQueue;
	for (let i = 0; i < capture.stores.length; i++) storeTarget.push(capture.stores[i]);
	if (capture.suspenseCommits !== undefined) {
		for (const state of capture.suspenseCommits) PUBLISH_SUSPENSE_COMMIT!(state);
	}
	const cleanups = capture.renderCleanups;
	if (cleanups !== undefined) {
		capture.renderCleanups = undefined;
		if (WIP_CAPTURE !== null) {
			const target = (WIP_CAPTURE.renderCleanups ??= []);
			for (const cleanup of cleanups) target.push(cleanup);
		} else {
			for (const cleanup of cleanups) cleanup(false);
		}
	}
}

/**
 * A nested window's checkpoint into the capture its render records into: the
 * lengths a dropped window truncates the capture back to.
 */
interface CaptureWindow {
	capture: OffscreenCapture;
	insertion: number;
	layout: number;
	passive: number;
	events: number;
	actions: number;
	refs: number;
	detaches: number;
	stores: number;
	cleanups: number;
	rendered: number;
	commits: number;
	presentations: number;
}

export function openCaptureWindow(capture: OffscreenCapture): CaptureWindow {
	return {
		capture,
		insertion: capture.effects[INSERTION].length,
		layout: capture.effects[LAYOUT].length,
		passive: capture.effects[PASSIVE].length,
		events: capture.events.length,
		actions: capture.eventActions.length,
		refs: capture.refs.length,
		detaches: capture.detaches?.length ?? 0,
		stores: capture.stores.length,
		cleanups: capture.renderCleanups?.length ?? 0,
		rendered: capture.renderedBlocks?.size ?? 0,
		commits: capture.suspenseCommits?.size ?? 0,
		presentations: capture.presentations?.length ?? 0,
	};
}

/** Drop the commit work a window captured, as discardOffscreenCapture drops a capture's. */
export function dropCaptureWindow(window: CaptureWindow): void {
	const capture = window.capture;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCaptureDiscarded(window);
	capture.effects[INSERTION].length = window.insertion;
	capture.effects[LAYOUT].length = window.layout;
	capture.effects[PASSIVE].length = window.passive;
	capture.events.length = window.events;
	capture.eventActions.length = window.actions;
	capture.refs.length = window.refs;
	if (capture.detaches !== undefined) capture.detaches.length = window.detaches;
	const stores = capture.stores;
	for (let i = window.stores; i < stores.length; i++) stores[i].queued = false;
	stores.length = window.stores;
	if (capture.presentations !== undefined) capture.presentations.length = window.presentations;
	const rendered = capture.renderedBlocks;
	if (rendered !== null && rendered.size > window.rendered) {
		// A completed earlier sibling's preserved props are not a valid bailout.
		let i = 0;
		for (const block of rendered) {
			if (i++ < window.rendered) continue;
			rendered.delete(block);
			invalidateRender(block, capture.renderRoot);
		}
	}
	const commits = capture.suspenseCommits;
	if (commits !== undefined && commits.size > window.commits) {
		let i = 0;
		for (const state of commits) if (i++ >= window.commits) commits.delete(state);
	}
	const cleanups = capture.renderCleanups;
	if (cleanups !== undefined && cleanups.length > window.cleanups) {
		const dropped = cleanups.splice(window.cleanups);
		for (const cleanup of dropped) cleanup(true);
	}
}

/** Drop captured commit work that never became visible. */
export function discardOffscreenCapture(capture: OffscreenCapture | null): void {
	if (capture === null) return;
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCaptureDiscarded(capture);
	if (NATIVE_READ_DRIVER) NATIVE_READ_DRIVER.discardCapture(capture);
	const rendered = capture.renderedBlocks;
	const owner = capture.renderRoot;
	capture.renderedBlocks = null;
	capture.renderRoot = null;
	if (rendered !== null) {
		// A completed earlier sibling may have had its effects/bindings rolled
		// back by a later suspension. Its preserved props are not a valid bailout.
		// Dispose paths have already unmounted their blocks and are ignored.
		for (const block of rendered) invalidateRender(block, owner);
	}
	for (let i = 0; i < capture.stores.length; i++) capture.stores[i].queued = false;
	const cleanups = capture.renderCleanups;
	if (cleanups !== undefined) {
		capture.renderCleanups = undefined;
		for (const cleanup of cleanups) cleanup(true);
	}
}

// Remove the slot's current content (Block, Text, or pure-host node) while
// preserving its marker pair, so a mode switch (or component-identity swap)
// rebuilds in place.
export function clearChildContent(state: ChildSlot): void {
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
		// A previous mode exit can already have retired the content while
		// retaining its nodes for rollback. A second clear must not sweep those
		// nodes or detach the anchor for the incoming subtree.
		if (
			state.block === null &&
			state.forSlot === null &&
			state.text === null &&
			state.hostNode === null
		)
			return;
		const parent =
			state.ownerHost ??
			state.start?.parentNode ??
			state.text?.parentNode ??
			state.hostNode?.parentNode ??
			state.block?.parentNode ??
			null;
		if (parent !== null) {
			journalRootChildShape(state);
			let first =
				state.ownerHost !== null || (state.borrowed && state.start === null)
					? getFirstChild(parent)
					: state.start !== null
						? getNextSibling(state.start)
						: (state.text ?? state.hostNode);
			const after =
				state.ownerHost !== null
					? null
					: state.start !== null || state.borrowed
						? state.end
						: (first?.nextSibling ?? null);
			if (first === after) first = null;
			const last =
				first === null ? null : after === null ? parent.lastChild : after.previousSibling;
			const oldBlock = state.block;
			const oldList = state.forSlot;
			const oldHost = state.hostNode;
			if (oldBlock !== null) queueSlotDeletion(state, oldBlock, first, last);
			else if (oldList !== null) {
				for (let item = oldList.head; item !== null; item = item.nextSibling) {
					retireRootBlock(item);
				}
				if (oldList.emptyBlock !== null) retireRootBlock(oldList.emptyBlock);
				slotNext(state).out.push(oldList, first, last);
			} else
				slotNext(state).out.push(
					oldHost === null ? null : () => detachDeoptTreeRefs(oldHost, null),
					first,
					last,
				);
			// Logical ownership changes now; saved committed nodes remain connected
			// until the root outcome is known. Incoming content mounts beside them.
			state.block = null;
			state.forSlot = null;
			state.text = null;
			state.hostNode = null;
			state.currentComp = null;
			if (state.ownerHost !== null) {
				state.start = null;
				state.end = null;
			}
			return;
		}
	}
	const hadBlock = state.block !== null;
	if (state.block !== null) {
		// Fire the subtree's cleanups but DON'T let unmountBlock strip the DOM —
		// it would take our markers with it. We remove the content nodes by hand.
		unmountBlock(state.block, false);
		state.block = null;
	}
	if (state.ownerHost !== null) {
		// OWNS-PARENT: the slot owns every child of the element — remove them all.
		// (Block cleanups already ran above; detach refs only on the blockless
		// path, mirroring the marker-range sweep below.)
		const host = state.ownerHost;
		let n: Node | null = getFirstChild(host);
		while (n !== null) {
			const next: Node | null = getNextSibling(n);
			if (!hadBlock) detachDeoptTreeRefs(n, null);
			host.removeChild(n);
			n = next;
		}
		// An owns-parent slot has no markers in any value regime EXCEPT a live
		// array, whose lazily-minted ForSlot pair sits INSIDE the host — so the
		// sweep above just detached it. Forget the pair: the array branch re-mints
		// on re-entry, and every other regime expects the markerless baseline.
		// Stale refs here would anchor the next mount (ForSlot, createBlock, or an
		// offscreen swap) on detached comments and insert into a null parent.
		state.start = null;
		state.end = null;
	} else if (state.start !== null) {
		// Component (or hydrated) range: sweep everything between the markers —
		// covers a multi-node component body as well as any leftover text node.
		// Block teardown above already detached every de-opt ref it owns
		// (unmountBlock's deoptNode hook + the slot walk), so detach here only on
		// the blockless path — the pure-host node (or hydrated leftovers), whose
		// subtree may carry stamped refs.
		const parent = state.start.parentNode;
		if (parent !== null) {
			let n: Node | null = getNextSibling(state.start);
			while (n !== null && n !== state.end) {
				const next: Node | null = getNextSibling(n);
				if (!hadBlock) detachDeoptTreeRefs(n, null);
				parent.removeChild(n);
				n = next;
			}
		}
	} else if (state.text !== null) {
		// Client text path: a single tracked Text node, no start marker to sweep.
		// (A MARKED pure-host node never appears here: the marked host branch of
		// childSlot mints `start` before it ever sets `hostNode`, so a live marked
		// hostNode is always swept by the marker-range branch above.)
		state.text.remove();
	} else if (state.hostNode !== null && state.hostNode.parentNode !== null) {
		// ANCHORLESS pure-host slot (end === null, no markers): remove the
		// self-delimiting node directly — the marker sweep above has nothing to
		// anchor on. Reached via disposeReturnSlot's kind-flip teardown; childSlot's
		// own mode flips promote to markers before ever clearing.
		detachDeoptTreeRefs(state.hostNode, null);
		state.hostNode.parentNode!.removeChild(state.hostNode);
	}
	state.text = null;
	state.currentComp = null;
	// The marker sweep above (or the direct removes) detached any pure-host node, so
	// drop the stale reference — a later pure-host render must rebuild, not "reuse" a
	// detached element.
	state.hostNode = null;
}

// True if any context the block read last render has since changed value
// (its Provider bumped the version). When so, a memo bailout must NOT skip —
// the block (or a consumer in its subtree) needs the new context value.
function ctxDepsChanged(block: Block): boolean {
	const reads = block.$$ctxReads;
	if (reads === null) return false;
	for (const [ctx, version] of reads) {
		if (ctx.$$version !== version) return true;
	}
	return false;
}

// True if this block's OWN render directly read a context whose value has since
// changed — meaning the block must re-run (vs only a descendant consumer needing
// a refresh). Distinguishes a memo'd CONSUMER (re-run it) from a memo'd pure
// INDIRECTION that merely wraps consumers (skip its body, refresh the consumers).
export function ctxDirectChanged(block: Block): boolean {
	const direct = block.$$ctxDirect;
	if (direct === null) return false;
	for (const [ctx, read] of direct) {
		const version = typeof read === 'number' ? read : read.version;
		if (ctx.$$version === version) continue;
		// Versions belong to the Context, not to one provider. Another provider
		// can change while this consumer's nearest value remains unchanged.
		if (
			typeof read === 'number' ||
			ctx.$$providerVersion !== ctx.$$version ||
			!Object.is(read.owner.$$ctxValues?.get(ctx), read.value)
		)
			return true;
		read.version = ctx.$$version;
	}
	return false;
}

// Shared epoch gate for the two bail paths: while no Provider anywhere has
// committed a value change since this block's deps were recorded/verified,
// both version scans are provably clean — skip them without even creating the
// map iterators. A clean scan re-stamps the block; a changed transitive dep
// refreshes just its consumers. Returns false when a DIRECT dep changed and
// the block's own body must re-run (bail refused).
function ctxBailDepsClean(block: Block): boolean {
	if (block.$$ctxDepsEpoch !== EPOCH_CELL.value) {
		if (ctxDirectChanged(block)) return false;
		if (ctxDepsChanged(block)) refreshContextConsumers(block);
		else block.$$ctxDepsEpoch = EPOCH_CELL.value;
	}
	return true;
}

/**
 * React-style lazy context propagation. A memo boundary bailed on props but a
 * context its subtree consumes changed; rather than re-running the boundary's
 * body (which would re-render the bailed-out indirection — Octane's old
 * push-cascade), descend into the boundary's already-rendered child blocks and
 * refresh ONLY the ones that actually consume the changed context. The boundary
 * itself never re-runs, matching React's `['App','Consumer']` (no 'Indirection').
 */
function refreshContextConsumers(block: Block): void {
	forEachSubtreeChild(block, refreshContextSubtree, false);
}

function refreshContextSubtree(scope: Scope): void {
	if (scope.block === scope) {
		refreshBlockForContext(scope as Block);
		return;
	}
	// A lightweight component has no Block slot of its own. Its descendants still
	// carry the memo ancestry and context dependencies, so cross the scope proxy and
	// continue through the same live-child taxonomy used by other subtree walks.
	forEachSubtreeChild(scope, refreshContextSubtree, false);
}

// React.memo's bail, shared by BOTH same-component update paths (componentSlot for
// compiled component positions, childSlot for value-position children — provider
// children, `.ts` binding trees). Skip the body when new props compare equal to the
// committed props, UNLESS the component itself directly reads a changed context (then
// it must re-run). If only a DESCENDANT consumes a changed context, refresh just those
// consumers without re-running this body — React's lazy propagation. Returns true when
// the update was fully handled (bail taken); the committed props identity is kept, and
// diffing against it next time is what makes the memo terminate.
export function tryMemoBail(block: Block, comp: any, props: any): boolean {
	if ((comp as any).__memo !== true) return false;
	// A memo body that suspended or threw on its initial attempt has no committed
	// props/output to reuse. This also makes lazy-resolved memo metadata safe to
	// publish during that attempt: the retry must execute until the Block mounts.
	if (!block.mounted || block.renderStatus !== RENDER_VALID) return false;
	const compare = (comp as any).__compare as ((prev: any, next: any) => boolean) | undefined;
	// React.memo's optional comparator: returns true when props are equal
	// (→ skip the render). Falls back to a shallow Object.is comparison.
	const equal = compare
		? (comp as any)[LAZY_BODY_CHECK] !== undefined
			? (compare as (prev: any, next: any, scope: Scope) => boolean)(block.props, props, block)
			: compare(block.props, props)
		: shallowEqualProps(block.props, props);
	if (!equal) return false;
	if (!ctxBailDepsClean(block)) return false;
	restampCtxDeps(block);
	reconnectBailedEffects(block);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileBail(block, comp, 'memo-bailout');
	return true;
}

// React beginWork's IMPLICIT bailout (`oldProps === newProps` → skip): the SAME
// committed props object (a cached element, a `children` passthrough) cannot
// produce different output, so skip the body and lazily refresh only the
// changed-context consumers below — identical contract to the memo bail, minus
// the props comparison (reference equality was already established by the
// caller). Only ARMED blocks (value-position mounts, which stamp context deps
// like memo blocks) may take this path; an unarmed block has no dep info, so
// bailing it could strand consumers. Returns true when the update was handled.
export function tryImplicitBail(block: Block): boolean {
	if (block.$$implicitBail !== true) return false;
	// A first attempt that suspended or threw has no committed output to reuse.
	// Its identity-equal retry must execute until this Block mounts successfully.
	if (!block.mounted || block.renderStatus !== RENDER_VALID) return false;
	const checkLazyBody = (block.body as any)[LAZY_BODY_CHECK] as LazyBodyCheck | undefined;
	if (checkLazyBody !== undefined && !checkLazyBody(block)) return false;
	if (!ctxBailDepsClean(block)) return false;
	restampCtxDeps(block);
	reconnectBailedEffects(block);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileBail(block, block.body, 'implicit-bailout');
	return true;
}

// After a bail the bailed subtree did NOT re-run, so its context reads were not
// re-stamped onto ancestors — but any ancestor that re-rendered THIS pass had
// its own $$ctxReads cleared by renderBlock. Without merging the bailed block's
// surviving deps back up, a later bail on that ancestor can't see that a
// consumer lives below it and strands the consumer (a changed context would
// never descend). Merge onto every memo/armed ancestor; prefer a STALE version
// over a current one so a still-pending refresh can't be masked by a fresher
// read of the same context elsewhere in the ancestor's subtree.
function restampCtxDeps(block: Block): void {
	const reads = block.$$ctxReads;
	const direct = block.$$ctxDirect;
	const hasReads = reads !== null && reads.size > 0;
	const hasDirect = direct !== null && direct.size > 0;
	if (!hasReads && !hasDirect) return;
	for (let b: Block | null = block.parentBlock; b !== null; b = b.parentBlock) {
		if ((b.body as any)?.__memo !== true && b.$$implicitBail !== true) continue;
		const m = (b.$$ctxReads ??= new Map());
		if (hasReads) {
			for (const [ctx, v] of reads!) {
				const cur = m.get(ctx);
				if (cur !== v) {
					const live = (ctx as any).$$version;
					if (cur === undefined || cur === live) {
						m.set(ctx, v);
						// A stale version merged in can mask a still-pending consumer
						// refresh — the receiving map is no longer verifiably current.
						if (v !== live) b.$$ctxDepsEpoch = -1;
					}
				}
			}
		}
		if (hasDirect) {
			for (const [ctx, read] of direct!) {
				const v = typeof read === 'number' ? read : read.version;
				const cur = m.get(ctx);
				if (cur !== v) {
					const live = (ctx as any).$$version;
					if (cur === undefined || cur === live) {
						m.set(ctx, v);
						if (v !== live) b.$$ctxDepsEpoch = -1;
					}
				}
			}
		}
	}
}

// A cached output region bypasses the memo/implicit bailouts that normally
// restore a skipped subtree's context dependencies onto rerendered ancestors.
// Descend only until the first stamped boundary: its aggregate already covers
// the entire live subtree. Lite child scopes are not Blocks, so continue
// through them rather than mistaking their owning block for a fresh boundary.
export function restampCachedContextScope(scope: Scope): void {
	if (scope.block === scope) {
		const block = scope as Block;
		if ((block.body as any)?.__memo === true || block.$$implicitBail === true) {
			restampCtxDeps(block);
			return;
		}
		if (block.$$ctxDirect !== null && block.$$ctxDirect.size !== 0) {
			restampCtxDeps(block);
		}
	}
	forEachSubtreeChild(scope, restampCachedContextScope);
}

function restampCachedSlotContext(slot: any): void {
	if (slot.__kind === 'forBlockSlot') {
		for (let item: Block | null = slot.head; item !== null; item = item.nextSibling) {
			restampCachedContextScope(item);
		}
		if (slot.emptyBlock !== null) restampCachedContextScope(slot.emptyBlock);
		return;
	}
	if (slot.block !== undefined && slot.block !== null) {
		restampCachedContextScope(slot.block);
		return;
	}
	if (slot.__kind !== 'childSlot') return;
	if (slot.forSlot !== null) {
		const list = slot.forSlot as ForSlot;
		for (let item: Block | null = list.head; item !== null; item = item.nextSibling) {
			restampCachedContextScope(item);
		}
		if (list.emptyBlock !== null) restampCachedContextScope(list.emptyBlock);
	} else if (slot.portal?.block !== undefined && slot.portal.block !== null) {
		restampCachedContextScope(slot.portal.block);
	}
}

export function refreshBlockForContext(block: Block): void {
	// A block whose dep maps were verified at the current context epoch holds no
	// stale entry: its own direct read cannot have changed, and for a memo/armed
	// block no DESCENDANT dep changed either. Non-memo intermediates carry no
	// $$ctxReads aggregate, so they still descend to find unstamped consumers.
	const verified = block.$$ctxDepsEpoch === EPOCH_CELL.value;
	if (!verified && ctxDirectChanged(block)) {
		// This child directly consumes the changed context (or shares its block
		// with a lite descendant that does): re-run it. renderBlock re-renders its
		// own subtree top-down, so nested consumers below it are reached normally.
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileSchedule(block, 'context');
		renderBlock(block);
	} else if ((block.body as any)?.__memo === true || block.$$implicitBail === true) {
		// A memo'd (or implicit-bail-armed) pure indirection: its $$ctxReads is
		// stamped, so prune to subtrees that actually hold a changed-context consumer.
		// A clean scan re-stamps it — direct was already verified above — so a
		// re-reach inside the same epoch prunes without rescanning.
		if (!verified) {
			if (ctxDepsChanged(block)) refreshContextConsumers(block);
			else block.$$ctxDepsEpoch = EPOCH_CELL.value;
		}
	} else {
		// A non-memo intermediate (control-flow branch, plain wrapper) isn't stamped
		// in $$ctxReads, so we can't prune — descend unconditionally to find any
		// consumer it strands. Bounded by this bailed boundary's subtree. Its own
		// direct map was verified above, so the stamp can only prune a re-check.
		if (!verified) block.$$ctxDepsEpoch = EPOCH_CELL.value;
		refreshContextConsumers(block);
	}
}

/** Revisit incomplete work without refreshing unrelated, still-valid cached subtrees. */
function refreshCachedBlock(block: Block, contextChanged: boolean): void {
	if (block.renderStatus !== RENDER_VALID) renderBlock(block);
	else if (contextChanged) refreshBlockForContext(block);
}

/**
 * Compiler ABI for a flat output-cache hit. Context consumers are normally
 * reached while their parent slot reconciles; a cache hit intentionally skips
 * that reconciliation, so an intervening Provider commit must refresh the
 * slot's existing Block(s) directly. Activity/Suspense reveals must also
 * reconnect effects retained by a skipped subtree, in its live source order,
 * and a hit (`restampMemoAncestors`) restores its descendants' context reads
 * onto memoized ancestors, whose own render cleared them. Outside a memo chain
 * a hit stays constant-time.
 * `previous === undefined` snapshots the epoch after a cache miss without
 * revisiting the freshly-rendered subtree.
 * @internal
 */
export function compilerCacheContext(
	scope: Scope,
	slotKey: number,
	previous: number | undefined,
	restampMemoAncestors: boolean = false,
): number {
	const current = EPOCH_CELL.value;
	if (previous === undefined) return current;
	const reconnect = !!EFFECT_RECONNECT_CONTEXT;
	const restamp = restampMemoAncestors && scope.block.memoInChain;
	// CURRENT_BLOCK is the real render owner even inside a compiler-lite scope.
	// A retry is local: it must not stale every cache epoch in unrelated roots.
	const retrying = CURRENT_BLOCK !== null && CURRENT_BLOCK.renderStatus !== RENDER_VALID;
	if (previous === current && !reconnect && !restamp && !retrying) return current;
	const slot = scope.slots[slotKey];
	if (slot === undefined || slot === null) return current;
	if (reconnect || retrying) {
		const contextChanged = previous !== current;
		const list =
			slot.__kind === 'forBlockSlot'
				? (slot as ForSlot)
				: slot.__kind === 'childSlot'
					? (slot.forSlot as ForSlot | null)
					: null;
		if (list !== null) {
			// Map insertion order stays unchanged when keyed survivors reorder;
			// effects must reconnect in the live linked chain's source order.
			for (let item: Block | null = list.head; item !== null; item = item.nextSibling) {
				refreshCachedBlock(item, contextChanged);
				if (reconnect) reconnectBailedEffects(item);
			}
			if (list.emptyBlock !== null) {
				refreshCachedBlock(list.emptyBlock, contextChanged);
				if (reconnect) reconnectBailedEffects(list.emptyBlock);
			}
		} else {
			const block = slot.block ?? (slot.__kind === 'childSlot' ? slot.portal?.block : null);
			if (block !== undefined && block !== null) {
				refreshCachedBlock(block, contextChanged);
				if (reconnect) reconnectBailedEffects(block);
			}
		}
		if (restamp) restampCachedSlotContext(slot);
		return current;
	}
	if (previous !== current) {
		if (slot.__kind === 'forBlockSlot') {
			for (const item of slot.items.values()) refreshBlockForContext(item);
			if (slot.emptyBlock) refreshBlockForContext(slot.emptyBlock);
		} else if (slot.block) {
			refreshBlockForContext(slot.block);
		} else if (slot.__kind === 'childSlot' && slot.forSlot) {
			for (const item of slot.forSlot.items.values()) refreshBlockForContext(item);
		} else if (slot.__kind === 'childSlot' && slot.portal?.block) {
			refreshBlockForContext(slot.portal.block);
		}
	}
	if (restamp) restampCachedSlotContext(slot);
	return current;
}

/**
 * Compiler ABI for a component tag bound inside the body (`const C =
 * props.comp; <C />`). Every other component a cached region skips either reads
 * no context or records its reads (memo walls, value-position mounts). This
 * one is unknown until render, so arm the scope before its slot mounts: Blocks
 * created below inherit memoInChain, and compilerCacheContext's refresh then
 * finds the consumer.
 * @internal
 */
export function compilerOpaqueTag<T>(scope: Scope, tag: T): T {
	if (!scope.block.memoInChain) promoteMemoAncestry(scope);
	return tag;
}

const OBJ_PROTO = Object.prototype;

// Runs on every re-render for every memo child (both tryMemoBail call sites),
// so the common plain-object case is a zero-allocation for-in compare — no
// Object.keys arrays. Semantics match React's shallowEqual: Object.is on values
// (NaN equal, ±0 differ), own-enumerable string keys only, key-SET equality
// (loop 1 checks values and ownership, loop 2's count balances the key sets).
// Inherited values must not stand in for removed own props, even when they
// compare equal. On a plain or null-prototype object a missing own prop reads
// as undefined or an Object.prototype member, which is a function or an object,
// so only those values need the ownership lookup; a primitive that compares
// equal is already own unless Object.prototype itself carries that primitive.
// Non-plain prototypes take the exact Object.keys slow path, where for-in would
// also see inherited keys.
function shallowEqualProps(a: any, b: any): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	const pa = Object.getPrototypeOf(a);
	const pb = Object.getPrototypeOf(b);
	if ((pa !== OBJ_PROTO && pa !== null) || (pb !== OBJ_PROTO && pb !== null)) {
		return shallowEqualPropsExact(a, b);
	}
	let count = 0;
	for (const k in a) {
		const v = a[k];
		if (!Object.is(v, b[k])) return false;
		if (
			(v === undefined || typeof v === 'object' || typeof v === 'function') &&
			!hasOwnProp.call(b, k)
		)
			return false;
		count++;
	}
	for (const _k in b) count--;
	return count === 0;
}

function shallowEqualPropsExact(a: any, b: any): boolean {
	const ka = Object.keys(a),
		kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	for (let i = 0; i < ka.length; i++) {
		const k = ka[i];
		// React uses Object.is (not ===) so NaN props compare equal and ±0 differ.
		if (!hasOwnProp.call(b, k) || !Object.is(a[k], b[k])) return false;
	}
	return true;
}

const MEMO_OWNER = Symbol('memoOwner');
const MEMO_MARKER_DESCRIPTOR: PropertyDescriptor = {
	get(this: ComponentBody<any>) {
		return this === (this as any)[MEMO_OWNER];
	},
};
// The wrapper renders exactly its component's output, so it self-delimits
// exactly when that component carries the compiler's single-root stamp. Read
// live: a module-tail stamp can land after `memo()` has run.
const MEMO_SINGLE_ROOT_DESCRIPTOR: PropertyDescriptor = {
	get(this: { type: ComponentBody<any> }) {
		return this === (this as any)[MEMO_OWNER] && (this.type as any).$$singleRoot === true;
	},
};
const MEMO_DEFAULT_PROPS_DESCRIPTOR: PropertyDescriptor = {
	configurable: true,
	// Static hoisters must copy `type` along with this accessor.
	get(this: { type: ComponentBody<any> }) {
		return (this.type as any).defaultProps;
	},
	set(this: { type: ComponentBody<any> }, value: unknown) {
		(this.type as any).defaultProps = value;
	},
};

/**
 * `memo(Component)` — React-shape HOC. Returns a wrapper component that
 * skips its body when the incoming props are shallow-equal to the committed
 * ones. Children inside the wrapped body still mount/update normally on the
 * first render and any non-skip render. Pair with `useCallback` /
 * `useMemo` on the parent so handler + computed prop refs stay stable across
 * renders that don't conceptually change the child's view.
 *
 * An optional `arePropsEqual(prevProps, nextProps)` comparator mirrors
 * React.memo's second argument: return `true` to skip the render (props are
 * "equal"), `false` to re-render. When omitted, a shallow Object.is comparison
 * of own enumerable keys is used.
 */
export function memo<C extends ComponentBody<any>>(
	component: C,
	arePropsEqual?: (
		prevProps: Readonly<Parameters<C>[0]>,
		nextProps: Readonly<Parameters<C>[0]>,
	) => boolean,
): C & { readonly type: C; displayName?: string };
export function memo<P>(
	component: ComponentBody<P>,
	arePropsEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean,
): ComponentBody<P> & { readonly type: ComponentBody<P>; displayName?: string };
/* @__NO_SIDE_EFFECTS__ */
export function memo<P>(
	component: ComponentBody<P>,
	arePropsEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean,
): ComponentBody<P> & { readonly type: ComponentBody<P>; displayName?: string } {
	function memoWrapper(props: P, scope: Scope, extra: any): unknown {
		// A render-function slot may replace its body while retaining children.
		// Arm only the Block this wrapper actually owns, never a direct call that
		// happens to execute inside another component's render scope.
		if (
			scope === CURRENT_SCOPE &&
			scope !== null &&
			!scope.block.memoInChain &&
			scope.block.body === memoWrapper
		)
			promoteMemoAncestry(scope);
		// Propagate the wrapped body's return so a folded (return-based) component
		// memo()'d here still hands its descriptor back to renderBlock to mount.
		return component(props, scope, extra);
	}
	// Static-hoisting HOCs copy even non-enumerable descriptors. Keep the marker
	// bound to its owner so copying it cannot memoize an unrelated wrapper. Define
	// the owner before shared accessors to keep every wrapper on the same shape.
	Object.defineProperty(memoWrapper, MEMO_OWNER, { value: memoWrapper });
	Object.defineProperty(memoWrapper, 'type', { value: component });
	Object.defineProperty(memoWrapper, 'displayName', {
		configurable: true,
		writable: true,
		value: (component as any).displayName || component.name || 'Memo',
	});
	Object.defineProperty(memoWrapper, '__memo', MEMO_MARKER_DESCRIPTOR);
	Object.defineProperty(memoWrapper, '$$singleRoot', MEMO_SINGLE_ROOT_DESCRIPTOR);
	// `createElement(memo(Component), …)` and `lazy(() => ({default:
	// memo(Component)}))` resolve defaults at the public wrapper boundary. Keep the
	// property live so a component that updates its defaultProps between renders
	// has the same observable behavior through memo as it does directly.
	Object.defineProperty(memoWrapper, 'defaultProps', MEMO_DEFAULT_PROPS_DESCRIPTOR);
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileComponentSource(memoWrapper, component);
	const checkLazyBody = (component as any)[LAZY_BODY_CHECK] as LazyBodyCheck | undefined;
	if (checkLazyBody !== undefined) {
		markLazyBodyCheck(memoWrapper, checkLazyBody);
		// Even the default comparator must remain explicit for this family: a
		// compiler memo witness may otherwise skip the slot before its body check.
		Object.defineProperty(memoWrapper, '__compare', {
			value: (prev: any, next: any, scope: Scope): boolean =>
				checkLazyBody(scope) &&
				(arePropsEqual ? arePropsEqual(prev, next) : shallowEqualProps(prev, next)),
		});
	} else if (arePropsEqual)
		Object.defineProperty(memoWrapper, '__compare', { value: arePropsEqual });
	return memoWrapper as ComponentBody<P> & {
		readonly type: ComponentBody<P>;
		displayName?: string;
	};
}

// ---------------------------------------------------------------------------
// HMR — hot-module-replacement wrapper for exported components
// ---------------------------------------------------------------------------
//
// The compiler emits `MyComp = hmr(MyComp);` after each exported component
// when its `hmr` option is on. A replacement module calls the previous
// wrapper's `MyComp[HMR].update(newMyComp)` during evaluation, then re-exports
// that canonical wrapper through its live bindings. The wrapper:
//
//   1. Defers to the current `fn` on every call — invocations route through
//      `wrapper[HMR].fn` so `update()` can replace it.
//   2. Tracks every live Block currently using this wrapper in a plain (strong)
//      Set, pruned lazily: disposed blocks are retained until the next
//      `update()` call deletes them (dev-only, so retention is bounded by edit
//      frequency). On `update(newFn)` we clear each block's compiler-owned
//      template/slot state, point its `body` at the new fn, and re-render. Hook
//      state is preserved because the Block stays live and the compiler emits
//      `Symbol.for(stableId)` for hook slots (re-imports get the same Symbol
//      identity, so the existing hooks Map continues to work).
//   3. Marks the wrapper IDENTITY-stable: HMR wrappers `Foo` and `Foo` (post-
//      reload) are the same wrapper, so `componentSlot`'s identity check
//      (`comp !== state.currentComp`) doesn't tear down on every edit.
//
// `HMR` is exported as a Symbol so user code (and the compiler emit) can
// read `wrapper[HMR]` without colliding with anything else on the function.

export const HMR: unique symbol = Symbol.for('octane.hmr');

export interface HmrMeta {
	fn: ComponentBody<any>;
	liveBlocks: Set<Block>;
	update(incoming: ComponentBody<any>): boolean;
}

export function hmr<P>(fn: ComponentBody<P>): ComponentBody<P> {
	const meta: HmrMeta = {
		fn,
		liveBlocks: new Set(),
		update(incoming: ComponentBody<any>): boolean {
			// The incoming function is the freshly-recompiled component body. If
			// the incoming function is itself an HMR wrapper (which it will be when
			// the new module re-runs `Comp = hmr(Comp)`), unwrap it down to the
			// raw fn — otherwise we'd nest wrappers on each edit.
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileComponentSource(wrapper, incoming);
			const incomingMeta = (incoming as any)[HMR] as HmrMeta | undefined;
			const nextFn = incomingMeta ? incomingMeta.fn : incoming;
			// Direct-template shorthand bodies and returned-output shorthand bodies
			// use different slot-0 ABIs. Let the bundler invalidate/full-reload this
			// module instead of reusing a live scope with the incompatible layout.
			if ((meta.fn as any).__octaneReturnedOutput !== (nextFn as any).__octaneReturnedOutput)
				return false;
			// A hot component may live in a single-element or inherited marker-elision
			// regime. Reject only incoherent/detached ranges; the accepted path promotes
			// a self-marked element to an HMR-owned comment range before removing it.
			for (const b of meta.liveBlocks) {
				if (b.disposed) {
					meta.liveBlocks.delete(b);
					continue;
				}
				if (!hasResettableHmrRange(b)) return false;
			}
			meta.fn = nextFn;
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileComponentSource(wrapper, meta.fn);
			// Keep the forwarded fetch plan in sync with the swapped body.
			markWarm(wrapper, (meta.fn as any).__warm);
			// Rebuild every live block's compiler-owned output, then schedule the new
			// body. The Block + hook map persist (stable Symbol.for-based keys), while
			// template/binding/component slots start from their mount path so arbitrary
			// source edits cannot read the previous compilation's layout. The outgoing
			// output stays on screen until the re-render's commit (clearHmrRange).
			const it = meta.liveBlocks.values();
			for (let r = it.next(); !r.done; r = it.next()) {
				const b = r.value;
				if (b.disposed) {
					meta.liveBlocks.delete(b);
					continue;
				}
				b.body = wrapper as unknown as ComponentBody<any>;
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileSchedule(b, 'hmr');
				resetHmrBlock(b);
				HMR_CLEARS.add(b);
				scheduleRender(b);
			}
			return true;
		},
	};
	function wrapper(this: unknown, props: P, scope: Scope, extra: any): unknown {
		// Every runtime body invocation passes the Scope it has just installed as
		// CURRENT_SCOPE. Register that block on first call; cleared lazily during
		// update() if disposed.
		if (scope === CURRENT_SCOPE && scope !== null) {
			meta.liveBlocks.add(scope.block);
			if (HMR_CLEARS.delete(scope.block)) clearHmrRange(scope.block);
			// Propagate the wrapped body's return — a return-based (folded) component
			// hands back a renderable descriptor that renderBlock must still mount.
			return meta.fn(props as any, scope, extra);
		}
		// Anything else is a direct call (`Row({ … })`, `renderRow(item, index)`),
		// whose second argument is an ordinary value. Register nothing and forward
		// the receiver and every argument unchanged, as production (no wrapper)
		// would. The call site's output still refreshes on edit: its owner's
		// update() re-renders the owning block, which re-runs the direct call
		// against the swapped-in body. Registering the AMBIENT block instead would
		// let update() repoint that block's body at this wrapper, miswiring the
		// caller. Only this branch reads `arguments`, so once the wrapper tiers up
		// Maglev and TurboFan elide the object on the per-render branch above (a
		// rest parameter would stay allocated under Maglev).
		return Reflect.apply(meta.fn, this, arguments);
	}
	Object.defineProperty(wrapper, HMR, {
		get() {
			return this === wrapper ? meta : undefined;
		},
	});
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileComponentSource(wrapper, fn);
	// Forward the parallel-use fetch plan (docs/suspense-parallel-use-plan.md):
	// the compiler attaches `__warm` to the INNER function; cross-module
	// consumers hold this wrapper, so warmChild must find the plan here too.
	if ((fn as any).__warm !== undefined) markWarm(wrapper, (fn as any).__warm);
	return wrapper as ComponentBody<P>;
}
