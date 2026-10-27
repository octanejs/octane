// Context
//
// createContext and providers, use(Context) and useContext, scoped and native
// resolvers, dependency recording, hosted-root context requests, and
// cross-renderer region owners.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './transitions.js';
import { hydrating } from '../hydration-flag.js';
import { formatClientError } from '../error-codes.client.generated.js';
import {
	CONTEXT_TAG,
	REACT_CONTEXT_TAG as REACT_FOREIGN_CONTEXT_TAG,
	RENDERER_REGION_OWNER_TAG as RENDERER_REGION_OWNER,
} from '../runtime-tags.js';
import { registerContext, defineRemovedContextMembers } from '../context-identity.js';
import {
	type NativeReadWitness,
	validateNativeReadWitness,
} from '../signals/native-read-collector.js';
import type {
	ComponentBody,
	RendererRegionOwnerBridge,
	Scope,
	CompilerMemoRegion,
	Block,
} from './types.js';
import { reportCaughtError, reportUncaughtError } from './drivers.js';
import {
	beginNativeReadScope,
	endNativeReadScope,
	beginNativeReadWitness,
	finishNativeReadWitness,
	replayNativeReadWitness,
} from './signal-owners.js';
import { blockSubtreeDisposed } from './refs.js';
import {
	DOM_ROOT_DISPOSERS,
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	journalRootProperty,
} from './engine.js';
import { ensureHooks, devMemoComputeDepth } from './hooks.js';
import { type TrackedThenable, SuspenseException, useThenable } from './use.js';
import { HYDRATION_PASS } from './hydration.js';
import { setReturnedOutputOwner, resetScopeChildren } from './block.js';
import { findSuspenseHiddenTry, findHiddenActivity, findTryHandler } from './suspense.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	ROOT_RENDER_TRANSACTION,
} from './render.js';
import {
	provideContext,
	CHILDREN_BODY,
	isChildrenBlock,
	childrenAsBody,
	CHILDREN_DIALECT_SLOT,
	ctxBailDepsClean,
	restampCtxDeps,
	ctxDirectChanged,
	refreshBlockForContext,
	restampCachedSlotContext,
} from './component-slots.js';
import { forEachSubtreeChild } from './activity.js';
import { refreshSkippedRows } from './lists.js';
import {
	JOURNAL_PROP,
	queueFrontier,
	noteFrontierMember,
	usesFrontier,
	atCommit,
	queueRootDeletion,
} from './commit.js';
import { getFirstChild, getNextSibling } from './templates.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// Only a recorded context read gives a Block dependencies to verify, so the
// recorder installs the work that consumes them: memo and implicit bail checks,
// cache-hit refreshes and skipped list rows. Applications that never record a
// read omit that graph. Until the first read no Block holds a dependency, and
// that work would find nothing to check, restamp or refresh.
export let CONTEXT_DEPENDENCIES: {
	clean: typeof ctxBailDepsClean;
	restamp: typeof restampCtxDeps;
	directChanged: typeof ctxDirectChanged;
	refresh: typeof refreshBlockForContext;
	restampSlot: typeof restampCachedSlotContext;
	skippedRows: typeof refreshSkippedRows;
} | null = null;
export let CONTEXT_CHILD: typeof useContextInternal | null = null;
const RENDERER_REGION_DOM_OWNERS = new WeakMap<Block, RendererRegionOwnerBridge>();
// Live region-owner roots (WeakMap exposes no size). Ordinary apps never bind
// one, so every bridge lookup's caller first tests this count by truthiness:
// one integer test per read, and a bundle without bindRendererRegionOwner
// never assigns it and omits the lookups.
export let RENDERER_REGION_OWNER_COUNT = 0;
const RENDERER_REGION_DOM_BINDINGS = new WeakMap<
	Block,
	{
		bridge: RendererRegionOwnerBridge;
		release: () => void;
	}
>();

// ---------------------------------------------------------------------------
// Context — createContext + use() (React 19 shape; useContext provided as an alias)
// ---------------------------------------------------------------------------

// Compiler-owned output caches compare their own lexical dependencies, but a
// Provider update is propagated lazily through the already-mounted Block tree
// rather than scheduling every consumer. One process-wide epoch (read as
// EPOCH_CELL from context-epoch.ts, whose Symbol.for'd cell is shared
// by every module copy so universal renderers and react-hosted mirrors share
// the same counter) lets generated cache guards and
// the $$ctxDepsEpoch bail fast path notice that exceptional channel without
// retaining any concrete Context, boundary, or component identity in the runtime.

export interface Context<T> {
	(props: { value: T; children?: any }, scope: Scope, extra?: unknown): void;
	$$kind: typeof CONTEXT_TAG;
	defaultValue: T;
	/**
	 * Monotonic version bumped whenever a Provider for this context commits a
	 * changed value. Consumers record the version they read at; the memo bailout
	 * (componentSlot) compares it so a context change forces a re-render through
	 * the push-cascade even when props are shallow-equal. See useContextInternal.
	 * Every bump must move the shared context epoch too — call bumpContextEpoch
	 * adjacent to the write, or (for external bumpers like react-hosted mirrors)
	 * guarantee a root.render commit follows, whose renderResolved entry bumps
	 * it. The $$ctxDepsEpoch bail fast path treats an unmoved epoch as "nothing
	 * changed", so an unpaired bump strands consumers.
	 */
	$$version: number;
	/** Local-provider provenance; -1 after any external version write. */
	$$providerVersion?: number;
}

/**
 * Create a Context. Providers push the value into a Block-scoped slot; `use(ctx)`
 * walks the Block parent chain to find the nearest Provider for that context.
 */
/* @__NO_SIDE_EFFECTS__ */
export function createContext<T>(defaultValue: T): Context<T> {
	// The Context itself is the provider component.
	const ctx = function ProviderBody(props, scope) {
		return renderClientContextProvider(ctx, props, scope);
	} as Context<T>;
	return initializeContext(ctx, defaultValue);
}

/** Compiler-owned private Context whose children are always compiled bodies. */
/* @__NO_SIDE_EFFECTS__ */
export function __createCompiledContext<T>(defaultValue: T): Context<T> {
	const ctx = function ProviderBody(props, scope) {
		provideContext(scope, ctx, props.value);
		const children = props.children as ComponentBody | null | undefined;
		if (children == null) return;
		// Children are always compiled bodies here, so unlike
		// renderClientContextProvider there is no descriptor dialect to flip to.
		const dialect = (children as any)[CHILDREN_BODY] ?? children;
		const previous = scope.hooks?.get(CHILDREN_DIALECT_SLOT);
		if (previous !== dialect) {
			if (previous !== undefined) {
				invalidateSharedBodyOutput(scope);
				if (TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK) {
					const hooks = scope.hooks!;
					journalUndo(() => hooks.set(CHILDREN_DIALECT_SLOT, previous));
				}
			}
			ensureHooks(scope).set(CHILDREN_DIALECT_SLOT, dialect);
		}
		renderSharedBody(children, undefined, scope, undefined);
	} as Context<T>;
	return initializeContext(ctx, defaultValue);
}

/**
 * A context identity for compiled children. Read it with use() or useContext(),
 * and provide it with <CompiledContext context={context} value={value}>.
 */
export function createCompiledContext<T>(defaultValue: T): Context<T> {
	const ctx = function CompiledProvider(_props, _scope): void {
		throw new TypeError(formatClientError(344));
	} as Context<T>;
	return initializeContext(ctx, defaultValue);
}

/**
 * Clear a Provider scope before new children render into it. Over committed DOM
 * the outgoing children leave at commit, after their cleanups, and the incoming
 * ones build in a frontier that lands before the Provider's end, as a dialect
 * flip's do. Returns the end to restore once the body has rendered.
 */
function resetProviderChildren(scope: Scope): Node | null | undefined {
	const block = scope.block;
	const parent = block.parentNode;
	const live = ROOT_RENDER_TRANSACTION !== null && usesFrontier(block, parent);
	resetScopeChildren(scope, !live);
	if (!live || block.disposed) return undefined;
	const end = block.endMarker;
	const first =
		block.startMarker !== null ? getNextSibling(block.startMarker) : getFirstChild(parent);
	if (first !== end)
		queueRootDeletion(null, first, end === null ? parent.lastChild : end.previousSibling);
	return openScopeFrontier(scope, block, parent);
}

/** A Provider whose children went away clears them once its render commits. */
function clearEmptiedProvider(scope: Scope): void {
	if (scope.block.disposed || scope.hooks?.get(CHILDREN_DIALECT_SLOT) !== 2) return;
	resetScopeChildren(scope);
	// The reset drops the hooks map; the scope still renders the empty dialect.
	ensureHooks(scope).set(CHILDREN_DIALECT_SLOT, 2);
}

/** Record a Provider's children dialect; a dropped window restores the previous one. */
function setChildrenDialect(scope: Scope, previous: unknown, dialect: unknown): void {
	if (previous !== undefined && TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK) {
		// A reset above may have dropped the hooks map, so the undo reopens it.
		journalUndo(() => ensureHooks(scope).set(CHILDREN_DIALECT_SLOT, previous));
	}
	ensureHooks(scope).set(CHILDREN_DIALECT_SLOT, dialect);
}

/** The children of this provider must be authored between its template tags. */
export function CompiledContext<T>(
	props: { context: Context<T>; value: T; children?: unknown },
	scope: Scope,
): void {
	provideContext(scope, props.context, props.value);
	const children = props.children;
	if (children == null) {
		// Children it rendered before still occupy the scope. Record the empty dialect, as the
		// descriptor Provider does: a rolled-back transition can restore their DOM, which the
		// next body must then clear rather than mount beside.
		const previous = scope.hooks?.get(CHILDREN_DIALECT_SLOT);
		if (previous !== undefined && previous !== 2) {
			setChildrenDialect(scope, previous, 2);
			// The outgoing children leave at commit, so an abandoned render keeps them.
			atCommit(clearEmptiedProvider, scope);
		}
		return;
	}
	if (!isChildrenBlock(children)) {
		throw new TypeError(formatClientError(345));
	}
	const dialect = (children as any)[CHILDREN_BODY] ?? children;
	const previous = scope.hooks?.get(CHILDREN_DIALECT_SLOT);
	let liveEnd: Node | null | undefined;
	if (previous !== dialect) {
		if (previous === 2) {
			liveEnd = resetProviderChildren(scope);
			if (scope.block.disposed) return;
		} else if (previous !== undefined) invalidateSharedBodyOutput(scope);
		setChildrenDialect(scope, previous, dialect);
	}
	let output: unknown;
	try {
		output = renderSharedBody(children as ComponentBody, undefined, scope, undefined);
	} finally {
		if (liveEnd !== undefined) scope.block.endMarker = liveEnd;
	}
	if (output != null) throw new TypeError(formatClientError(345));
}

function initializeContext<T>(ctx: Context<T>, defaultValue: T): Context<T> {
	CONTEXT_CHILD = useContextInternal;
	ctx.$$kind = CONTEXT_TAG;
	ctx.defaultValue = defaultValue;
	ctx.$$version = 0;
	ctx.$$providerVersion = 0;
	registerContext(ctx);
	if (process.env.NODE_ENV !== 'production') {
		// Octane has no render-prop Consumer (slot-keyed hooks make use()/useContext
		// legal behind any condition) and no `.Provider` (the context is the
		// provider). See defineRemovedContextMembers for each member's behavior.
		defineRemovedContextMembers(ctx);
	}
	return ctx;
}

/**
 * Identify the Context already provided by this deferred child's own scope
 * without observing userland Provider accessors or Proxy traps.
 * @internal
 */
export function compilerOwnsContextProvider(value: unknown): boolean {
	return CURRENT_SCOPE?.$$ctxValues?.has(value as Context<any>) === true;
}

/** Renderer-boundary adapter; ordinary DOM roots never retain this by themselves. */
export function renderClientContextProvider<T>(
	context: unknown,
	props: { value: unknown; children?: unknown },
	renderScope: object,
): void {
	const ctx = context as Context<T>;
	const scope = renderScope as Scope;
	provideContext(scope, ctx, props.value as T);
	// Children between the Provider tags reach us in one of two shapes:
	//   - a compiled render-body FUNCTION — the `.tsrx` `{props.children}` lowering;
	//   - an element descriptor / renderable — a React-style `.tsx` parent, where
	//     `<Ctx>…</Ctx>` lowers to `createElement(Ctx,
	//     { value }, …children)` and `createElement` mirrors the positional children
	//     into `props.children` (a descriptor, an array, or text — never a function).
	// `childrenAsBody` normalizes either shape to a callable body, so both dialects
	// render their children inside the Provider's scope (and thus under its context).
	//
	// The two dialects both claim `scope.slots[0]` — a compiled body stores its binding
	// bag there, while the descriptor path's `childSlot(scope, 0, …)` stores a childSlot
	// record. A parent that wraps its children conditionally (common in ported React
	// bindings) flips between them across renders, so the incoming dialect would read the
	// outgoing one's record as its own and corrupt the tree. Remount the children on a
	// flip instead: the two sides are structurally different code, which is the same
	// contract React gives an element-type change.
	const children = props.children;
	// Empty children on a Provider that has rendered some still reconcile, as a
	// descriptor hole, so the previous children are removed rather than kept.
	if (children != null || scope.hooks?.get(CHILDREN_DIALECT_SLOT) !== undefined) {
		// Compiled closures carry their stable source-body identity. Their function
		// identity changes when a parent supplies fresh captures, but their output
		// still owns the same slots and may retain its auto-memo dependencies.
		const dialect =
			typeof children === 'function' ? ((children as any)[CHILDREN_BODY] ?? children) : 2;
		const previous = scope.hooks?.get(CHILDREN_DIALECT_SLOT);
		let liveEnd: Node | null | undefined;
		if (previous !== dialect) {
			if (previous !== undefined && (previous === 2 || dialect === 2)) {
				const block = scope.block;
				const parent = block.parentNode;
				// Over committed DOM the outgoing children leave at commit, after their
				// cleanups, and the incoming ones build in a frontier that lands before
				// the Provider's end.
				const live = ROOT_RENDER_TRANSACTION !== null && usesFrontier(block, parent);
				resetScopeChildren(scope, !live);
				// The reset runs user cleanups, so it can throw into the enclosing boundary and
				// switch it to its catch arm — which disposes this block. Rendering children
				// into a disposed block writes into the catch range, so bail out here, as every
				// other mid-render teardown site does after `unmountBlock`.
				if (block.disposed) return;
				if (live) {
					const end = block.endMarker;
					const first =
						block.startMarker !== null ? getNextSibling(block.startMarker) : getFirstChild(parent);
					if (first !== end)
						queueRootDeletion(null, first, end === null ? parent.lastChild : end.previousSibling);
					liveEnd = openScopeFrontier(scope, block, parent);
				}
			} else if (previous !== undefined) {
				// A different body reused the same DOM/control slots. Its predecessor's
				// output dependencies no longer prove what those slots contain. Hook
				// values remain per-body and keep their mounted lifetime.
				invalidateSharedBodyOutput(scope);
				if (TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK) {
					const hooks = scope.hooks!;
					journalUndo(() => hooks.set(CHILDREN_DIALECT_SLOT, previous));
				}
			}
			ensureHooks(scope).set(CHILDREN_DIALECT_SLOT, dialect);
		}
		try {
			renderSharedBody(childrenAsBody(children), undefined, scope, undefined);
		} finally {
			if (liveEnd !== undefined) scope.block.endMarker = liveEnd;
		}
	}
}

/**
 * Point `scope`'s Block, whose content in `parent` is new this render, at a
 * frontier its commit inserts before the Block's end. Returns that end, which
 * the caller puts back once the render returns.
 */
export function openScopeFrontier(scope: Scope, owner: Block, parent: Node): Node | null {
	const block = scope.block;
	const end = block.endMarker;
	const frag = queueFrontier(owner, parent, end);
	journalRootProperty(block, 'parentNode', parent);
	block.parentNode = frag;
	block.endMarker = null;
	noteFrontierMember(frag, scope);
	return end;
}

// Only the directly shared Scope needs stronger component ownership. Ordinary
// descendants retain their lite paths, and nested shared bodies restore the
// outer owner without allocating a stack or adding state to every Scope.
export let SHARED_BODY_SCOPE: Scope | null = null;

export function renderSharedBody(body: ComponentBody, props: any, scope: Scope, extra: any): any {
	const previous = SHARED_BODY_SCOPE;
	SHARED_BODY_SCOPE = scope;
	try {
		return body(props, scope, extra);
	} finally {
		SHARED_BODY_SCOPE = previous;
	}
}

/** Body handoffs are cold; ordinary Provider updates keep their cache arrays. */
export function invalidateSharedBodyOutput(scope: Scope): void {
	// The new body must either claim the old slot imperatively or reconcile its
	// return, including undefined. The previous body's void completion does not
	// establish the new body's output mode (lazy can even resolve a builtin).
	const state = scope.slots[0] as any;
	// Ownership belongs only to a return-capable Block's own Scope, never a
	// lite/shared child Scope whose slot zero belongs to another Block.
	if (
		scope === scope.block &&
		scope.block.outputHandler !== null &&
		(state?.__kind === 'childSlot' ||
			state?.__kind === 'componentSlotSlot' ||
			state?.__kind === 'ifBlockSlot' ||
			state?.__kind === 'switchBlockSlot' ||
			state?.__kind === 'activityBlockSlot')
	) {
		setReturnedOutputOwner(state, true);
	}
	const first = scope.compilerMemo;
	if (first === null) return;
	invalidateSharedBodyMemoRegion(first);
	if (first.overflow !== null) {
		for (const region of first.overflow.values()) invalidateSharedBodyMemoRegion(region);
	}
}

function invalidateSharedBodyMemoRegion(region: CompilerMemoRegion): void {
	if (region.auto === undefined) return;
	// A candidate may complete before a later sibling suspends. Rollback must
	// restore the accepted body's dependencies along with its visible output.
	if (TRANSITION_JOURNAL !== null && !ROOT_RENDER_ROLLBACK) {
		TRANSITION_JOURNAL.push(JOURNAL_PROP, region, 'auto', region.auto);
	}
	region.auto = undefined;
}

/**
 * React 19's `use()` — accepts either a Context<T> or a thenable (Promise<T>).
 *
 * - `use(context)`: walks the Block tree from CURRENT_BLOCK upward to find a
 *   Provider's value (or the default).
 * - `use(thenable)`: if fulfilled, returns the value; if rejected, rethrows
 *   the reason (caught by the nearest tryBlock's catch); if pending, throws
 *   an internal SuspenseException (caught by the nearest tryBlock and routed
 *   to its `pending` body).
 *
 * The thenable mutates in place to gain `.status` / `.value` / `.reason`
 * fields the second time it's seen — matches React's `trackUsedThenable`.
 * Per-block `thenableState[]` keyed by call index lets the body replay
 * synchronously after the promise resolves.
 */
/**
 * Structural view of a foreign host-renderer context (a real `React.Context<T>`
 * inside an `octane/react` island). Deliberately matches React 19's Consumer
 * shape WITHOUT importing React types — core stays host-agnostic; only hosted
 * roots can actually resolve one (§6.2).
 */
export interface ForeignHostContext<T> {
	readonly Consumer: (props: { children: (value: T) => any }) => any;
}

/**
 * Excludes octane ELEMENT descriptors from `use()`'s thenable arms.
 * `Octane.JSX.Element` type-level-extends `Promise<ReactNode>` (the React 19
 * tag gate — see src/jsx-runtime.d.ts), so a bare `PromiseLike<T>` arm would
 * admit elements bivariantly even though their promise protocol is poisoned.
 * The optional-`never` `$$kind` keeps every real thenable assignable (they
 * simply lack the property) while rejecting `$$kind`-branded descriptors,
 * making `use(<El/>)` the same hard type error `await <El/>` is. Octane
 * contexts are unaffected: they match the separate `Context<T>` arm.
 */
type NotAnElementDescriptor = { $$kind?: never };

export function use<T>(
	usable:
		| Context<T>
		| (PromiseLike<T> & NotAnElementDescriptor)
		| (TrackedThenable<T> & NotAnElementDescriptor)
		| ForeignHostContext<T>,
): T {
	if (process.env.NODE_ENV !== 'production' && devMemoComputeDepth !== 0) {
		console.error(
			'Do not call use() inside a useMemo() factory. Cached factories can skip context or promise reads; call use() before useMemo() and memoize the returned value instead.',
		);
	}
	if (usable && (usable as any).$$kind === CONTEXT_TAG) {
		return useContextInternal(usable as Context<T>);
	}
	if (usable == null || typeof (usable as any).then !== 'function') {
		// Cold path: not an Octane context, not a thenable. Under a hosted root
		// this may be a FOREIGN host-renderer context (a real React context
		// inside an octane/react island) — the owner bridge resolves it to a
		// root-local mirror. Normal roots fall through to the diagnostic.
		return useForeignContext(usable, 'use');
	}
	return useThenable(usable as TrackedThenable<T>);
}

// React 19 context objects carry $$typeof: Symbol.for('react.context') — used
// ONLY to sharpen the out-of-hosted-root diagnostic, never as a read strategy.

/**
 * Resolve a non-Octane usable through the enclosing renderer-region owner
 * (docs/react-hosted-octane-compat-plan.md §6.2). Kept out of `use()` so the
 * hot paths carry no extra code; only already-failing calls reach here.
 */
function useForeignContext<T>(usable: unknown, api: string): T {
	if (usable !== null && typeof usable === 'object') {
		const bridge = RENDERER_REGION_OWNER_COUNT ? rendererRegionOwnerForBlock(CURRENT_BLOCK) : null;
		const mirror = bridge?.resolveForeignContext?.(usable as object);
		if (mirror != null) return useContextInternal(mirror as Context<T>);
		if ((usable as { $$typeof?: unknown }).$$typeof === REACT_FOREIGN_CONTEXT_TAG) {
			throw new Error(formatClientError(18, api));
		}
	}
	throw new Error(formatClientError(12, api));
}

/**
 * Internal renderer-boundary variant of `use(thenable)`. A universal root owns
 * and memoizes each suspended attempt, so a different thenable on resume is an
 * authoritative next dependency rather than an uncached user promise. Replace
 * the stored thenable even during resume replay so a sequential A -> B
 * suspension keeps the outer host fallback visible until B settles.
 */
export function useRendererThenable<T>(thenable: PromiseLike<T>): T {
	return useThenable(thenable as TrackedThenable<T>, true);
}

/**
 * React's `useContext(Context)` — reads the nearest Provider's value (or the
 * context default). A thin alias for the context branch of `use()`: context
 * reads carry no per-call-site state, so there is no hook slot and the compiler
 * needs no rewrite. Provided for React familiarity; `use(Context)` is the
 * React-19 idiom and remains the primary form.
 */
export function useContext<T>(context: Context<T> | ForeignHostContext<T>): T {
	if (context && (context as any).$$kind === CONTEXT_TAG) {
		return useContextInternal(context as Context<T>);
	}
	// Same cold foreign-context path as `use()` — a real React context resolves
	// through the hosted owner; anything else gets the targeted diagnostic
	// (previously a non-context read silently produced `undefined`).
	return useForeignContext(context, 'useContext');
}

// Sentinel cached in a consumer's resolved-provider slots to mean "no provider —
// use the context's default". Distinct from `undefined` (a cache miss) so a
// resolved default is an O(1) hit rather than a re-walk to the root every read.
export const DEFAULT_CTX: unique symbol = Symbol('octane.ctx.default');

export function rendererRegionOwnerForBlock(block: Block | null): RendererRegionOwnerBridge | null {
	// bindRendererRegionOwner throws unless the block is a top-level root
	// (kind 'root', no parent), so ancestors below the chain top can never be
	// keys — climb straight there and pay one lookup per call instead of one
	// per ancestor on every no-provider context read.
	let current = block;
	while (current !== null && current.parentBlock !== null) current = current.parentBlock;
	if (current === null) return null;
	const bridge = RENDERER_REGION_DOM_OWNERS.get(current);
	return bridge !== undefined && bridge.active ? bridge : null;
}

export function rendererRegionTryHandler(block: Block | null): ((error: unknown) => void) | null {
	const bridge = rendererRegionOwnerForBlock(block);
	if (bridge === null) return null;
	return (error) => {
		if (!bridge.routeError(error)) throw error;
	};
}

export function rendererRegionSuspenseHandler(
	block: Block | null,
): ((thenable: PromiseLike<unknown>) => void) | null {
	const bridge = rendererRegionOwnerForBlock(block);
	if (bridge === null) return null;
	return (thenable) => {
		if (!bridge.routeSuspense(thenable)) throw new SuspenseException(thenable);
	};
}

/**
 * Compiler ABI for a DOM component materialized from a reverse renderer region.
 * The bridge is deliberately attached only to the owning DOM root; normal DOM
 * blocks retain no renderer fields or dispatch branches.
 */
export function bindRendererRegionOwner(props: unknown): void {
	const bridge = (props as any)?.[RENDERER_REGION_OWNER] as RendererRegionOwnerBridge | undefined;
	if (bridge === undefined) {
		throw new Error(formatClientError(19));
	}
	if (CURRENT_BLOCK === null || CURRENT_SCOPE === null) {
		throw new Error(formatClientError(20));
	}
	if (
		CURRENT_BLOCK.kind !== 'root' ||
		CURRENT_BLOCK.parentBlock !== null ||
		CURRENT_SCOPE !== CURRENT_BLOCK
	) {
		throw new Error(formatClientError(21));
	}
	const root = CURRENT_BLOCK;
	// hydrateRoot() runs its adoption pass BEFORE the Root object (and its
	// disposer) exists, so a hydrating owned root is bound with a LAZY disposer
	// lookup; every other caller must already have a live root.
	if (
		DOM_ROOT_DISPOSERS.get(root) === undefined &&
		(!hydrating || HYDRATION_PASS!.rootBlock !== root)
	) {
		throw new Error(formatClientError(22));
	}
	const previous = RENDERER_REGION_DOM_BINDINGS.get(root);
	if (previous?.bridge === bridge) return;
	// A distinct callback avoids deleting a newly-registered disposer when two
	// successive descriptor bridges share one committed lifecycle cell. The
	// lookup is lazy so a disposer registered after a hydration pass is honored.
	const dispose = () => DOM_ROOT_DISPOSERS.get(root)?.();
	const release = bridge.registerDispose(dispose);
	previous?.release();
	const binding = { bridge, release };
	RENDERER_REGION_DOM_BINDINGS.set(root, binding);
	RENDERER_REGION_DOM_OWNERS.set(root, bridge);
	root.$$ctxCache = null;
	root.$$ctxCacheOwner = null;
	if (previous === undefined) {
		RENDERER_REGION_OWNER_COUNT++;
		(root.cleanups ??= []).push(() => {
			const current = RENDERER_REGION_DOM_BINDINGS.get(root);
			if (current === undefined) return;
			current.release();
			RENDERER_REGION_DOM_BINDINGS.delete(root);
			RENDERER_REGION_DOM_OWNERS.delete(root);
			RENDERER_REGION_OWNER_COUNT--;
		});
	}
}

// ---------------------------------------------------------------------------
// Hosted-root control signal (§6.3 HostContextRequest): thrown by an owner
// bridge's readContext when a foreign-context read cannot be satisfied
// synchronously. handleRenderError recognizes it BEFORE local boundary
// routing, so island @catch/@pending arms never observe it; the owner
// receives the carried thenable through routeSuspense and settles it once
// the authoritative host value has committed.
// ---------------------------------------------------------------------------

const HOST_CONTEXT_REQUEST_TAG = Symbol.for('octane.host-context-request');

interface HostContextRequestSignal {
	$$kind: typeof HOST_CONTEXT_REQUEST_TAG;
	thenable: PromiseLike<unknown>;
}

/**
 * Build the §6.3 control signal for an owner bridge to THROW from
 * `readContext`. The thenable must settle when the owner has committed the
 * requested foreign value; the owner then retries the owned root.
 * @internal owner-bridge ABI (octane/react and future hosts).
 */
/* @__NO_SIDE_EFFECTS__ */
export function createHostContextRequest(thenable: PromiseLike<unknown>): HostContextRequestSignal {
	return { $$kind: HOST_CONTEXT_REQUEST_TAG, thenable };
}

export function isHostContextRequest(err: unknown): err is HostContextRequestSignal {
	try {
		return (
			err !== null &&
			typeof err === 'object' &&
			(err as { $$kind?: unknown }).$$kind === HOST_CONTEXT_REQUEST_TAG
		);
	} catch {
		// An opaque application error must not interrupt render cleanup.
		return false;
	}
}

// A retained subtree can acquire a memo/implicit boundary after construction.
// Promote its existing Blocks and lite proxies before a context read checks its
// memoInChain flag. True is conservative and remains valid after
// rollback or a later body change, so this metadata needs no journal entry.
export function promoteMemoAncestry(scope: Scope): void {
	const block = scope.block;
	if (scope === block && block.memoInChain) return;
	block.memoInChain = true;
	// A host child Scope can borrow the already-promoted Block. Its own children
	// still need visiting; only an actual Block owns the subtree proof above.
	forEachSubtreeChild(scope, promoteMemoAncestry);
}

export type DirectContextRead = number | { version: number; owner: Scope; value: unknown };
// Most consumers read one context; keep their dependency in one small record.
export type DirectContextReads = {
	context: Context<any>;
	read: DirectContextRead;
	next: DirectContextReads | null;
};

function findDirectContextRead(direct: DirectContextReads | null, context: Context<any>) {
	while (direct !== null && direct.context !== context) direct = direct.next;
	return direct;
}

function recordContextDependency(
	block: Block | null,
	context: Context<any>,
): DirectContextRead | undefined {
	if (block === null || !block.memoInChain) return;
	CONTEXT_DEPENDENCIES ??= {
		clean: ctxBailDepsClean,
		restamp: restampCtxDeps,
		directChanged: ctxDirectChanged,
		refresh: refreshBlockForContext,
		restampSlot: restampCachedSlotContext,
		skippedRows: refreshSkippedRows,
	};
	const direct = findDirectContextRead(block.$$ctxDirect, context);
	const previous = direct?.read;
	// Stamp before resolving: hosted context reads may suspend or throw.
	if (direct === null) {
		block.$$ctxDirect = { context, read: context.$$version, next: block.$$ctxDirect };
	} else direct.read = context.$$version;
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		if ((current.body as any)?.__memo === true || current.$$implicitBail === true) {
			(current.$$ctxReads ??= new Map()).set(context, context.$$version);
		}
	}
	return previous;
}

function recordLocalContextValue(
	reader: Scope | null,
	block: Block | null,
	context: Context<any>,
	value: unknown,
	previous: DirectContextRead | undefined,
): void {
	if (reader === null || block === null || !block.memoInChain) return;
	// A replayed, hosted, or unresolved read keeps the coarse dependency. So
	// does a block that reads this Context through more than one local provider.
	if (typeof previous === 'number' || context.$$providerVersion !== context.$$version) return;
	const cache = reader.$$ctxCache;
	const owner =
		cache === context
			? reader.$$ctxCacheOwner
			: cache !== null && reader.$$ctxCacheOwner === null
				? (cache as Map<Context<any>, Scope | typeof DEFAULT_CTX>).get(context)
				: undefined;
	if (owner === null || owner === undefined || owner === DEFAULT_CTX) return;
	const direct = findDirectContextRead(block.$$ctxDirect, context)!;
	if (previous !== undefined) {
		if (previous.owner !== owner || !Object.is(previous.value, value)) return;
		previous.version = context.$$version;
		direct.read = previous;
	} else {
		direct.read = { version: context.$$version, owner, value };
	}
}

// Active only while a scoped JSX resolver reads its deferred record (see
// createScopedResolver). A scoped record has to rebuild when a context it
// actually read changes, and the reads collected here are what "actually read"
// means: a descriptor that reads no context is never rebuilt by a provider
// update, so the props object it produced — and every inline callback identity
// inside it — survives. Rebuilding on a global epoch instead made an unrelated
// provider update hand a component's children brand-new prop identities, which
// churns effect/memo deps and cannot converge when such an effect feeds that
// provider.
let SCOPED_READ_TRACKING = false;
let SCOPED_READS: Map<Context<any>, number> | null = null;

function scopedReadsChanged(reads: Map<Context<any>, number> | null): boolean {
	if (reads === null) return false;
	for (const [context, version] of reads) {
		if (context.$$version !== version) return true;
	}
	return false;
}

// Classification can resolve a descriptor before its host/item Block owns it.
// A cache hit must transfer those reads to the current render, just like an
// actual useContext call. Nested resolvers also contribute to their enclosing
// resolver's capture, or caching the outer record would hide the nested reads.
function replayScopedContextReads(reads: Map<Context<any>, number>, block: Block | null): void {
	for (const [context, version] of reads) {
		if (block !== null) recordContextDependency(block, context);
		if (SCOPED_READ_TRACKING) (SCOPED_READS ??= new Map()).set(context, version);
	}
}

export function createScopedResolver<T>(read: () => T): () => T {
	let resolved = false;
	let resolvedScope: Scope | null = null;
	let resolvedReads: Map<Context<any>, number> | null = null;
	let resolvedValue: T;

	return (): T => {
		// A record that read no context is the same in every scope, and every
		// field read of a scoped value lands here. Return it without consulting
		// the scope, which only a context-reading record compares.
		if (resolved && resolvedReads === null) return resolvedValue;
		const scope = CURRENT_SCOPE;
		const sameScope =
			resolvedScope === scope ||
			(resolvedScope !== null &&
				scope !== null &&
				scope.block.parentBlock === resolvedScope.block &&
				scope.$$ctxValues === null);
		// A context-reading record is rebuilt when its resolving scope changes.
		// Host classification previews a record in the parent block before its
		// direct child block renders it, so that one same-context handoff is
		// reusable.
		if (!resolved || scopedReadsChanged(resolvedReads) || (resolvedReads !== null && !sameScope)) {
			const previousTracking = SCOPED_READ_TRACKING;
			const previousReads = SCOPED_READS;
			SCOPED_READ_TRACKING = true;
			SCOPED_READS = null;
			let next: T;
			let nextReads: Map<Context<any>, number> | null;
			try {
				next = read();
			} finally {
				nextReads = SCOPED_READS;
				SCOPED_READ_TRACKING = previousTracking;
				SCOPED_READS = previousReads;
				// An enclosing resolver may catch this read's error and cache its
				// fallback, so even an unsuccessful attempt contributes dependencies.
				if (previousTracking && nextReads !== null) replayScopedContextReads(nextReads, null);
			}
			resolvedScope = scope;
			resolvedReads = nextReads;
			resolvedValue = next;
			resolved = true;
		} else {
			// Move ownership from the previewing parent to its direct child so a
			// later sibling or provider scope still resolves independently. Only a
			// context-reading record reaches this branch.
			resolvedScope = scope;
			replayScopedContextReads(resolvedReads!, CURRENT_BLOCK);
		}
		return resolvedValue;
	};
}

// The native compiler selects this resolver explicitly. It keeps the same
// context/preview handoff as ordinary scoped JSX, while the current resolving
// Scope owns native reads even when the authored component body has returned.
export function createNativeScopedResolver<T>(read: () => T): () => T {
	let resolved = false;
	let resolvedScope: Scope | null = null;
	let resolvedReads: Map<Context<any>, number> | null = null;
	let resolvedWitness: NativeReadWitness | null | undefined;
	let resolvedValue: T;

	return (): T => {
		const scope = CURRENT_SCOPE;
		// Reusing an invocation scope needs no restoration token, but its reads
		// still belong to the render. Only an inspection without an owner is
		// imperative and must be recomputed when the record later renders.
		const collecting = scope !== null && CURRENT_BLOCK !== null;
		const token = beginNativeReadScope(undefined);
		let completed = false;
		try {
			const sameScope =
				resolvedScope === scope ||
				(resolvedScope !== null &&
					scope !== null &&
					scope.block.parentBlock === resolvedScope.block &&
					scope.$$ctxValues === null);
			if (
				!resolved ||
				scopedReadsChanged(resolvedReads) ||
				(resolvedReads !== null && !sameScope) ||
				(collecting && resolvedWitness === undefined) ||
				!validateNativeReadWitness(resolvedWitness)
			) {
				const previousTracking = SCOPED_READ_TRACKING;
				const previousReads = SCOPED_READS;
				SCOPED_READ_TRACKING = true;
				SCOPED_READS = null;
				const witnessToken = beginNativeReadWitness();
				let readCompleted = false;
				let next: T;
				let nextReads: Map<Context<any>, number> | null;
				let nextWitness: NativeReadWitness | null;
				try {
					next = read();
					readCompleted = true;
				} finally {
					nextReads = SCOPED_READS;
					SCOPED_READ_TRACKING = previousTracking;
					SCOPED_READS = previousReads;
					if (previousTracking && nextReads !== null) replayScopedContextReads(nextReads, null);
					nextWitness = finishNativeReadWitness(witnessToken, readCompleted);
				}
				resolvedScope = scope;
				resolvedReads = nextReads;
				// An imperative inspection stays untracked. Recompute once inside a
				// real render before trusting it as native evidence for this record.
				resolvedWitness = collecting ? nextWitness : undefined;
				resolvedValue = next;
				resolved = true;
			} else {
				resolvedScope = scope;
				if (resolvedReads !== null) replayScopedContextReads(resolvedReads, CURRENT_BLOCK);
				if (collecting) replayNativeReadWitness(resolvedWitness);
			}
			completed = true;
			return resolvedValue;
		} finally {
			endNativeReadScope(token, completed);
		}
	};
}

function cacheContextOwner(
	reader: Scope | null,
	context: Context<any>,
	owner: Scope | typeof DEFAULT_CTX,
): void {
	if (reader === null) return;
	const cache = reader.$$ctxCache;
	if (cache === null) {
		reader.$$ctxCache = context;
		reader.$$ctxCacheOwner = owner;
		return;
	}
	const inlineOwner = reader.$$ctxCacheOwner;
	if (inlineOwner !== null) {
		const spill = new Map<Context<any>, Scope | typeof DEFAULT_CTX>();
		spill.set(cache as Context<any>, inlineOwner);
		spill.set(context, owner);
		reader.$$ctxCache = spill;
		reader.$$ctxCacheOwner = null;
	} else {
		(cache as Map<Context<any>, Scope | typeof DEFAULT_CTX>).set(context, owner);
	}
}

function readContextFrom<T>(reader: Scope | null, block: Block | null, context: Context<T>): T {
	// One boolean test per context read; the map is allocated only for a
	// descriptor that reads context while resolving.
	if (SCOPED_READ_TRACKING) (SCOPED_READS ??= new Map()).set(context, context.$$version);
	if (reader !== null) {
		const cache = reader.$$ctxCache;
		const hit =
			cache === context
				? reader.$$ctxCacheOwner
				: cache !== null && reader.$$ctxCacheOwner === null
					? (cache as Map<Context<any>, Scope | typeof DEFAULT_CTX>).get(context)
					: undefined;
		if (hit !== null && hit !== undefined) {
			if (hit === DEFAULT_CTX) {
				const bridge = RENDERER_REGION_OWNER_COUNT ? rendererRegionOwnerForBlock(block) : null;
				return bridge === null ? context.defaultValue : bridge.readContext(context);
			}
			return (hit as Scope).$$ctxValues!.get(context) as T;
		}
	}

	let scope: Scope | null = reader;
	while (scope !== null) {
		const values = scope.$$ctxValues;
		if (values !== null && values.has(context)) {
			cacheContextOwner(reader, context, scope);
			return values.get(context) as T;
		}
		scope = scope.parent;
	}
	let current = block?.parentBlock ?? null;
	while (current !== null) {
		const values = current.$$ctxValues;
		if (values !== null && values.has(context)) {
			cacheContextOwner(reader, context, current);
			return values.get(context) as T;
		}
		current = current.parentBlock;
	}
	const bridge = RENDERER_REGION_OWNER_COUNT ? rendererRegionOwnerForBlock(block) : null;
	if (bridge !== null) return bridge.readContext(context);
	cacheContextOwner(reader, context, DEFAULT_CTX);
	return context.defaultValue;
}

/** @internal Live context reader rooted at a captured DOM boundary scope. */
export function readContextFromScope<T>(scope: Scope, context: Context<T>): T {
	const previous = recordContextDependency(scope.block, context);
	const value = readContextFrom(scope, scope.block, context);
	recordLocalContextValue(scope, scope.block, context, value, previous);
	return value;
}

/** @internal Cold adapter query; native render and hide paths pay no extra work. */
export function getRendererOwnerVisibility(scope: Scope): 'visible' | 'suspense' | 'activity' {
	if (findHiddenActivity(scope.block) !== null) return 'activity';
	return findSuspenseHiddenTry(scope.block) !== null ? 'suspense' : 'visible';
}

/** @internal Route a deferred foreign-renderer cleanup fault to a surviving owner. */
export function reportRendererOwnerError(scope: Scope, error: unknown): void {
	const origin = scope.block;
	let owner: Block | null = origin;
	while (owner !== null && blockSubtreeDisposed(owner)) owner = owner.parentBlock;
	const handler = findTryHandler(owner);
	if (handler !== null) reportCaughtError(owner, error, handler(error));
	else if (!reportUncaughtError(origin, error)) {
		if (typeof reportError === 'function') reportError(error);
		else console.error(error);
	}
}

function useContextInternal<T>(context: Context<T>): T {
	// Record the context dependency on every enclosing memo() block, with the
	// version read. The push-cascade re-renders a Provider's subtree top-down;
	// a memo bailout would otherwise sever that cascade and strand consumers
	// (the memo'd component itself, its lite descendants, AND deeper consumers)
	// with a stale value. Stamping memo ancestors lets the bailout detect the
	// version change and decline to skip. Only memo blocks are stamped, so this
	// costs nothing for the common no-memo tree.
	// Skip the walk entirely when no memo block sits at or above us — the loop
	// would stamp nothing. `memoInChain` is precomputed at block creation, so the
	// common no-memo tree pays a single boolean test instead of an ancestor walk
	// per `use()` call.
	const previous = recordContextDependency(CURRENT_BLOCK, context);
	const value = readContextFrom(CURRENT_SCOPE, CURRENT_BLOCK, context);
	recordLocalContextValue(CURRENT_SCOPE, CURRENT_BLOCK, context, value, previous);
	return value;
}
