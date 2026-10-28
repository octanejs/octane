// Deferred hydration boundaries
//
// `<Hydrate when={...}>`: strategies, prefetch, interaction replay, streamed
// boundaries and activation.

import { createBlock, registerSlot, SLOT_FLAG_TEARDOWN } from './block.js';
import { hydrating, hydrationStarted } from '../hydration-flag.js';
import { EPOCH_CELL } from '../context-epoch.js';
import {
	STREAM_BOUNDARY_ATTR,
	HYDRATE_STATIC_ID_COUNT_PREFIX,
	HYDRATE_STATIC_END,
	HYDRATE_WHEN_ATTR,
	HYDRATE_ID_ATTR,
	HYDRATE_ID_COUNT_ATTR,
	HYDRATE_SEED_ATTR,
	HYDRATE_INDEPENDENT_ATTR,
} from '../constants.js';
import type {
	HydrationWhen,
	HydrateProps,
	HydrationStrategy,
	HydrationPrefetchWaitReason,
	HydrationPrefetchStrategy,
	HydrationPrefetchFunction,
} from '../hydration/types.js';
import { cloneHydrationReplayEvent } from '../hydration/replay-event.js';
import {
	HYDRATE_INTERACTION_EVENTS_ATTR,
	HYDRATE_DEFAULT_INTERACTION_EVENTS,
	isHydrationLifecycleEvent,
	HYDRATE_LIFECYCLE_INTERACTION_EVENTS,
} from '../hydration/interaction-config.js';
import {
	unregisterHydrationIntentBoundary,
	HYDRATE_SUPPORTED_INTERACTION_EVENTS,
	type HydrationReplayIntent,
	type HydrationIntentBoundaryStatus,
	wasEarlyHydrationIntentHandled,
	markDelegatedDynamicHydrationIntent,
	hydrationEventPathWithin,
	shouldPreventHydrationInteractionDefault,
	initializeHydrationEventCapture,
	type HydrationIntentBoundary,
	takeDelegatedDynamicHydrationIntent,
	registerHydrationIntentBoundary,
	takePendingHydrationIntents,
} from '../hydration/event-capture.js';
import { markComponentFlags, COMPONENT_FLAG_BOUNDARY } from '../component-flags.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { HYDRATE_MARKER_SELECTOR } from '../hydration-protocol.js';
import {
	isBlockOpen,
	isRendererStreamToken,
	rendererRangeClose,
	HYDRATE_STREAM_TOKEN_ATTR,
	isRendererStreamBoundaryTemplate,
} from '../stream-protocol.js';
import { NATIVE_SIGNAL_SEED_ATTR } from '../signals/native-read-seeds.js';
import type {
	ComponentBody,
	EffectFn,
	Scope,
	RootIdState,
	Block,
	HydrateSlot,
	TrySlot,
} from './types.js';
import { scopeSignalOwner, renderBlock } from './signal-owners.js';
import { journalRootProperty, scheduleRender } from './engine.js';
import { useEffect, useId } from './hooks.js';
import {
	type TrackedThenable,
	SuspenseException,
	isSuspenseException,
	trackThenable,
} from './use.js';
import type { Context } from './context.js';
import { CURSOR, isRendererHydrationStyle, type HydrationCapability } from './hydration.js';
import {
	findScheduledVisibilityOwner,
	suspenseRetryBatchForSubtree,
	tryBlockImpl,
} from './suspense.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	requeuePassiveEffect,
	activateHydrateBoundary,
} from './render.js';
import { keptHydrationIsland, placeKeptIsland, removeNodes } from './roots.js';
import { markHydrationDiscard, discardedByHydration } from './hydration-presentation.js';
import { componentSourceLoc } from './diagnostics.js';
import {
	CHILDREN_BODY,
	CHILDREN_CAPTURES,
	CHILDREN_SIGNAL_OWNER,
	childrenAsBody,
} from './component-slots.js';
import { childSlot } from './child-slots.js';
import { forEachSubtreeChild } from './activity.js';
import {
	slotNext,
	slotFrontier,
	queueFrontier,
	noteFrontierMember,
	usesFrontier,
	atCommit,
	journalObjectOnce,
} from './commit.js';
import { getFirstChild, getNextSibling, DeferredHydrationSuspension } from './templates.js';
import { eventPathNode } from './events.js';
import { ROOT_RENDER_ROLLBACK } from './drivers.js';
import { rollbackEntry } from '../rollback-flag.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// ---------------------------------------------------------------------------
// Deferred hydration — `<Hydrate when={...}>`
// ---------------------------------------------------------------------------

const HYDRATE_ID_SLOT = Symbol('octane.hydrate.id');
const HYDRATE_SETUP_SLOT = Symbol('octane.hydrate.setup');
export const HYDRATE_NOTIFY_SLOT = Symbol('octane.hydrate.notify');
const HYDRATE_STRATEGY_TYPES = /* @__PURE__ */ new Set<HydrationWhen>([
	'load',
	'idle',
	'visible',
	'media',
	'interaction',
	'condition',
	'never',
	'dynamic',
]);
// Boundary-local interaction capture uses the same marker protocol as the
// lightweight pre-root event-capture module.

export const HYDRATE_STREAM_ERROR_ATTR = 'data-oct-err';
const HYDRATE_STREAM_BOUNDARY_SELECTOR = `template[${STREAM_BOUNDARY_ATTR}]`;
const HYDRATE_STREAM_SCAN_MASK = 1 /* SHOW_ELEMENT */ | 128; /* SHOW_COMMENT */

type HydrateLoadResult = ComponentBody | { default: ComponentBody };

export type InternalHydrateProps = HydrateProps & {
	/** Compiler-injected split-child loader. */
	__load?: () => Promise<HydrateLoadResult>;
	/** Latest lexical values consumed by the compiler-generated split child. */
	__data?: unknown[];
	/** Compiler-owned independent island descriptor; the document bootstrap owns activation. */
	__independent?: unknown;
	/** Bundler graph edge only. Runtime must never evaluate the lexical parent through it. */
	__independentLoad?: () => Promise<unknown>;
};

// Created only for the rare activation that races a renderer stream. Keep the
// ordinary Hydrate state shape unchanged and retain no completed boundaries.
let hydrateStreamWaitCleanups: WeakMap<HydrateSlot, () => void> | null = null;

/**
 * What a dormant server-preserved boundary was first claimed with. The server
 * HTML is the output of exactly these captures, so while the boundary activates
 * with equal captures a value mismatch is a genuine server/client divergence.
 * Once a mounted parent legitimately changes them, the server HTML predates the
 * client's own state, so the island hydrates with these, as React hydrates a
 * dehydrated boundary before the update that reached it, and the newer ones
 * apply as an update once that commits (activateHydrateBoundary). Deciding
 * this compares values and never runs a child render.
 */
export interface HydrateInitialCaptures {
	props: InternalHydrateProps;
	contexts: Map<Context<any>, any> | null;
	contextEpoch: number;
}

function collectHydrateContexts(scope: Scope): Map<Context<any>, any> | null {
	let contexts: Map<Context<any>, any> | null = null;
	const add = (values: Map<Context<any>, any> | null) => {
		if (values === null) return;
		for (const [context, value] of values) {
			contexts ??= new Map();
			if (!contexts.has(context)) contexts.set(context, value);
		}
	};
	for (let current: Scope | null = scope; current !== null; current = current.parent)
		add(current.$$ctxValues);
	for (let block = scope.block.parentBlock; block !== null; block = block.parentBlock)
		add(block.$$ctxValues);
	return contexts;
}

export function changedHydrateCaptures(
	initial: InternalHydrateProps,
	next: InternalHydrateProps,
): boolean {
	if (initial === next) return false;
	if (initial.__data === undefined || next.__data === undefined)
		return changedHydrateChildren(initial.children, next.children);
	if (initial.__data.length !== next.__data.length) return true;
	for (let i = 0; i < initial.__data.length; i++) {
		if (!Object.is(initial.__data[i], next.__data[i])) return true;
	}
	return false;
}

function changedHydrateChildren(initial: unknown, next: unknown): boolean {
	if (initial === next) return false;
	if (typeof initial !== 'function' || typeof next !== 'function') return true;
	try {
		const body = (initial as any)[CHILDREN_BODY];
		const initialCaptures = (initial as any)[CHILDREN_CAPTURES] as
			(() => readonly unknown[]) | null | undefined;
		const nextCaptures = (next as any)[CHILDREN_CAPTURES] as
			(() => readonly unknown[]) | null | undefined;
		// Without the compiler's capture certificate for the same source body,
		// equal output cannot be proven. Treat the server values as stale.
		if (
			body === undefined ||
			body !== (next as any)[CHILDREN_BODY] ||
			initialCaptures == null ||
			nextCaptures == null
		)
			return true;
		const before = initialCaptures();
		const after = nextCaptures();
		if (before.length !== after.length) return true;
		for (let i = 0; i < before.length; i++) {
			if (!Object.is(before[i], after[i])) return true;
		}
		return false;
	} catch {
		return true;
	}
}

/**
 * The context values `state`'s server HTML was rendered with, where the
 * island's current ones differ: a context it reads no provider of now reads
 * as its default. Null when none differ. Every provider value change moves
 * the epoch, so an unmoved epoch proves the inherited values are the claimed
 * ones.
 */
export function serverHydrateContexts(
	state: HydrateSlot,
	initial: HydrateInitialCaptures,
): Map<Context<any>, any> | null {
	if (initial.contextEpoch === EPOCH_CELL.value) return null;
	const current = collectHydrateContexts(
		CURRENT_SCOPE?.block === state.parentBlock ? CURRENT_SCOPE : state.parentBlock,
	);
	let server: Map<Context<any>, any> | null = null;
	for (const [context, value] of initial.contexts ?? [])
		if (current === null || !current.has(context) || !Object.is(value, current.get(context)))
			(server ??= new Map()).set(context, value);
	for (const context of current?.keys() ?? [])
		if (initial.contexts === null || !initial.contexts.has(context))
			(server ??= new Map()).set(context, context.defaultValue);
	return server;
}

/**
 * After an island hydrated the captures its server HTML was rendered with
 * (activateHydrateBoundary), its newer ones apply as an update in a render of
 * their own, once that hydration commits, as React applies an update that
 * reached a dehydrated boundary after hydrating it. A reader of a context the
 * island shadowed with its server value (`shadowed`) renders again too: the
 * cascade that delivered the newer value ran before it existed.
 */
export function applyHydrateCaptures(state: HydrateSlot, shadowed: boolean): void {
	const blocks: Block[] = [state.block];
	if (shadowed) forgetShadowedContexts(state.block, state.block, blocks);
	atCommit(renderHydratedUpdate, blocks);
}

/** Drop the context owners that scopes under `scope` resolved to `owner`, and collect their blocks. */
function forgetShadowedContexts(scope: Scope, owner: Block, readers: Block[]): void {
	forEachSubtreeChild(scope, (child) => {
		const cache = child.$$ctxCache;
		let read = false;
		if (child.$$ctxCacheOwner === owner) {
			child.$$ctxCache = child.$$ctxCacheOwner = null;
			read = true;
		} else if (cache !== null && child.$$ctxCacheOwner === null) {
			for (const [context, resolved] of cache as Map<Context<any>, unknown>)
				if (resolved === owner) read = (cache as Map<Context<any>, unknown>).delete(context);
		}
		if (read) {
			// A lite stand-in renders with the Block it belongs to.
			let block = child.block as Block;
			while (block.block !== block) block = block.parentBlock!;
			readers.push(block);
		}
		forgetShadowedContexts(child, owner, readers);
	});
}

function renderHydratedUpdate(blocks: Block[]): void {
	for (const block of blocks) if (!block.disposed) scheduleRender(block);
}

function hydrateStrategyType(when: InternalHydrateProps['when']): HydrationWhen {
	return typeof when === 'function' ? 'dynamic' : (when?._t ?? 'dynamic');
}

export function reserveHydrationIds(ids: RootIdState, count: number): void {
	let owner = ids;
	while (count > 0) {
		while (owner.limit !== undefined && owner.next >= owner.limit && owner.overflow !== undefined) {
			owner = owner.overflow;
		}
		if (owner.limit === undefined || owner.overflow === undefined) {
			owner.next += count;
			return;
		}
		const available = owner.limit - owner.next;
		const reserved = Math.min(count, available);
		owner.next += reserved;
		count -= reserved;
	}
}

interface PermanentStaticHydrationMarker {
	idCount: number;
	streamToken: string | null;
}

function parsePermanentStaticHydrationMarker(data: string): PermanentStaticHydrationMarker | null {
	if (!data.startsWith(HYDRATE_STATIC_ID_COUNT_PREFIX)) return null;
	const payload = data.slice(HYDRATE_STATIC_ID_COUNT_PREFIX.length);
	let rawCount = payload;
	let streamToken: string | null = null;
	const separator = payload.lastIndexOf(':');
	if (separator !== -1) {
		streamToken = payload.slice(0, separator);
		rawCount = payload.slice(separator + 1);
		if (!isRendererStreamToken(streamToken)) return null;
	}
	if (!/^(?:0|[1-9]\d*)$/.test(rawCount)) return null;
	const idCount = Number(rawCount);
	return Number.isSafeInteger(idCount) ? { idCount, streamToken } : null;
}

function permanentStaticHydrationRangeEnd(
	marker: Comment,
	expectedStreamToken?: string,
): { end: Comment; idCount: number } | null {
	const parsed = parsePermanentStaticHydrationMarker(marker.data);
	if (
		parsed === null ||
		(expectedStreamToken !== undefined && parsed.streamToken !== expectedStreamToken)
	)
		return null;
	const childClose = rendererRangeClose(getNextSibling(marker));
	const end = childClose?.nextSibling;
	const expectedEnd =
		parsed.streamToken === null
			? HYDRATE_STATIC_END
			: HYDRATE_STATIC_END + ':' + parsed.streamToken;
	return end?.nodeType === 8 && (end as Comment).data === expectedEnd
		? { end: end as Comment, idCount: parsed.idCount }
		: null;
}

function preservePermanentStaticHydrationRange(scope: Scope): void {
	const hydration = hydrating ? CURSOR : null;
	if (hydration === null) return;
	const marker = hydration.node;
	if (marker?.nodeType !== 8) return;
	const range = permanentStaticHydrationRangeEnd(marker as Comment);
	if (range === null) return;
	reserveHydrationIds(scope.block.idState, range.idCount);
	hydration.node = getNextSibling(marker);
	// The untouched range keeps its server markers until the commit.
	atCommit(removeNodes, [marker, range.end]);
}

function resolveHydrateStrategy(state: HydrateSlot): HydrationStrategy {
	const raw = state.props.when;
	let strategy: HydrationStrategy;
	if (typeof raw === 'function') {
		strategy = state.dynamicStrategy ?? raw();
	} else {
		strategy = raw;
	}
	if (
		strategy === null ||
		typeof strategy !== 'object' ||
		!HYDRATE_STRATEGY_TYPES.has((strategy as HydrationStrategy)._t)
	) {
		throw new Error(formatClientError(16));
	}
	if (typeof raw === 'function') state.dynamicStrategy = strategy;
	state.strategy = strategy;
	return strategy;
}

function resolveHydrateLoadResult(value: HydrateLoadResult): ComponentBody {
	const body =
		value !== null && typeof value === 'object' && 'default' in value ? value.default : value;
	if (typeof body !== 'function') {
		throw new Error(formatClientError(17));
	}
	return body;
}

function renderHydrateChild(state: HydrateSlot, scope: Scope, extra: unknown): void {
	if (state.loadedBody !== null) {
		// The module is cached, but its captures are render data. Read the latest
		// array from props on every pass so prefetching and later parent updates do
		// not freeze the values that happened to exist when the chunk first loaded.
		state.loadedBody(state.props.__data, scope, extra);
		return;
	}
	childrenAsBody(state.props.children)(undefined, scope, extra);
}

function renderCompiledHydrateChild(state: HydrateSlot, scope: Scope, extra: unknown): void {
	if (state.loadedBody !== null) {
		state.loadedBody(state.props.__data, scope, extra);
	} else {
		(state.props.children as ComponentBody)(undefined, scope, extra);
	}
}

const EMPTY_HYDRATE_PENDING: ComponentBody = () => undefined;

function hydrateBoundaryBody(state: HydrateSlot): ComponentBody {
	return createHydrateBoundaryBody(state, renderHydrateChild, (_props, scope) => {
		childSlot(scope, 0, scope.block.parentNode, state.props.fallback, scope.block.endMarker);
	});
}

function compiledHydrateBoundaryBody(state: HydrateSlot): ComponentBody {
	// Keep a real empty pending arm: null would propagate suspension and change
	// the try block's ownership, transition swap and scheduled visibility policy.
	return createHydrateBoundaryBody(state, renderCompiledHydrateChild, EMPTY_HYDRATE_PENDING);
}

function createHydrateBoundaryBody(
	state: HydrateSlot,
	renderChild: typeof renderHydrateChild,
	pendingBody: ComponentBody,
): ComponentBody {
	let waitingForFirstModule =
		pendingBody === EMPTY_HYDRATE_PENDING &&
		!state.serverPreserved &&
		state.props.__load !== undefined;
	const contentBody: ComponentBody = (_props, scope, extra) => {
		try {
			if (state.loadedBody === null) {
				const preload = beginHydratePreload(state);
				if (preload !== null) {
					// This internal code-chunk thenable is not application `use()` data and
					// must never consume a server seed. Track/throw it directly through the
					// enclosing tryBlock; the stable cached promise makes retries safe.
					const thenable = preload as TrackedThenable<void>;
					trackThenable(thenable);
					if (thenable.status === 'rejected') throw thenable.reason;
					if (thenable.status !== 'fulfilled') throw new SuspenseException(thenable);
				} else {
					// An inline child can mount work and then suspend. Even if that render
					// rolls back, a later module must go through the normal reveal path.
					waitingForFirstModule = false;
				}
			}
			renderChild(state, scope, extra);
		} catch (error) {
			// The server's content is already visible. An activation that suspends
			// drops its attempt, never mounting a fallback over it, and the island
			// adopts its server DOM afresh once the wakeable settles, as a
			// suspended Suspense arm does (activateHydrateBoundary).
			if (hydrating && state.serverPreserved && !state.hydrated && isSuspenseException(error))
				throw new DeferredHydrationSuspension(error.thenable);
			throw error;
		}
		state.hydrated = true;
		// Runtime-owned effect bodies receive their dependency tuple as arguments.
		useEffect(notifyHydrateBoundary as EffectFn, [state, scope], HYDRATE_NOTIFY_SLOT);
	};
	// The children render in this internal try body but belong to the template
	// that authored them (see markChildrenBlock), so the body's signal owner links
	// to that template's owner once created (see scopeSignalOwner). A split
	// boundary's children are written between its tags: that template renders it.
	Object.defineProperty(contentBody, CHILDREN_SIGNAL_OWNER, {
		get: () =>
			state.props.__load === undefined
				? (state.props.children as any)?.[CHILDREN_SIGNAL_OWNER]
				: scopeSignalOwner(state.parentBlock.signalInstanceParent),
	});
	return (_props, scope) => {
		if (
			waitingForFirstModule &&
			state.loadedBody === null &&
			state.props.__load !== undefined &&
			!state.hasError &&
			!ROOT_RENDER_ROLLBACK &&
			(!hydrating || CURSOR === null)
		) {
			const pending = state.preloadPromise as TrackedThenable<void> | null;
			const slot = scope.slots[0] as TrySlot | undefined;
			// The empty fallback is already visible. The registered retry will read
			// the latest props on settlement. Parent renders cannot reveal it sooner.
			if (
				pending?.status === 'pending' &&
				slot?.pendingThenable === pending &&
				slot.branch === 2 &&
				slot.hiddenDom !== null &&
				!slot.hasResolved &&
				!slot.transitionHeld &&
				slot.tryBlock?.inactive &&
				!slot.tryBlock.disposed &&
				findScheduledVisibilityOwner(scope.block, true, 'urgent') === null &&
				suspenseRetryBatchForSubtree(scope.block) === null
			)
				return;
		}
		tryBlockImpl(
			scope,
			0,
			scope.block.parentNode,
			contentBody,
			null,
			pendingBody,
			scope.block.endMarker,
		);
	};
}

function failHydrateBoundary(state: HydrateSlot, error: unknown): void {
	if (state.hasError || state.block.disposed) return;
	state.initialCaptures = null;
	cleanupHydrateStreamWait(state);
	state.hasError = true;
	state.error = error;
	scheduleRender(state.parentBlock);
}

function beginHydratePreload(state: HydrateSlot): Promise<void> | null {
	const load = state.props.__load;
	if (load === undefined) return null;
	if (state.preloadPromise !== null) return state.preloadPromise;
	let pending: Promise<HydrateLoadResult>;
	try {
		pending = load();
	} catch (error) {
		pending = Promise.reject(error);
	}
	const promise = Promise.resolve(pending).then((result) => {
		state.loadedBody = resolveHydrateLoadResult(result);
	});
	state.preloadPromise = promise;
	// Prefetch can start without a later hydration request. Keep a rejection from
	// becoming unhandled and route it through the boundary's normal render path.
	void promise.catch((error) => failHydrateBoundary(state, error));
	return promise;
}

function resolveHydrateWaiters(state: HydrateSlot, reason: HydrationPrefetchWaitReason): void {
	const waiters = state.hydrationWaiters;
	if (waiters === null) return;
	state.hydrationWaiters = null;
	for (const waiter of waiters) waiter(reason);
}

function waitForHydratePrefetchStrategy(
	state: HydrateSlot,
	strategy: HydrationPrefetchStrategy,
): Promise<HydrationPrefetchWaitReason> {
	const controller = state.prefetchAbort;
	if (controller === null || controller.signal.aborted) return Promise.resolve('abort');
	// A procedural prefetch may begin in the same turn that `when` requests
	// hydration (load() is the common case). Preserve that already-fired signal
	// for late waitFor() subscribers instead of installing a strategy that can
	// now win only after the hydration request it was meant to race.
	if (state.activationRequested) return Promise.resolve('hydrate');
	return new Promise((resolve) => {
		const signal = controller.signal;
		let settled = false;
		let cleanup: (() => void) | void;
		const finish = (reason: HydrationPrefetchWaitReason) => {
			if (settled) return;
			settled = true;
			cleanup?.();
			state.hydrationWaiters?.delete(onHydrate);
			signal.removeEventListener('abort', onAbort);
			resolve(reason);
		};
		const onHydrate = () => finish('hydrate');
		const onAbort = () => finish('abort');
		(state.hydrationWaiters ??= new Set()).add(onHydrate);
		signal.addEventListener('abort', onAbort, { once: true });
		cleanup = strategy._s?.({
			element: state.wrapper,
			prefetch: () => finish('prefetch'),
		});
		if (settled) cleanup?.();
	});
}

function beginProceduralHydratePrefetch(state: HydrateSlot): Promise<void> | null {
	const prefetch = state.props.prefetch;
	if (typeof prefetch !== 'function') return null;
	if (state.prefetchStarted) return state.prefetchPromise;
	state.prefetchStarted = true;
	const controller = (state.prefetchAbort = new AbortController());
	let result: ReturnType<HydrationPrefetchFunction>;
	try {
		result = prefetch({
			element: state.wrapper,
			signal: controller.signal,
			preload: () => beginHydratePreload(state) ?? Promise.resolve(),
			waitFor: (strategy) => waitForHydratePrefetchStrategy(state, strategy),
		});
	} catch (error) {
		failHydrateBoundary(state, error);
		return null;
	}
	if (result === undefined || result === null || typeof (result as any).then !== 'function') {
		return null;
	}
	const promise = Promise.resolve(result).then(() => undefined);
	state.prefetchPromise = promise;
	void promise.catch((error) => failHydrateBoundary(state, error));
	return promise;
}

function cleanupHydrateStrategy(state: HydrateSlot): void {
	const cleanup = state.strategyCleanup;
	if (cleanup !== null) disposeHydrateInstaller(state, cleanup);
	state.strategyCleanup = null;
	state.gate = null;
}

function cleanupHydrateInstallers(state: HydrateSlot): void {
	cleanupHydrateStrategy(state);
	const cleanup = state.prefetchCleanup;
	if (cleanup !== null) disposeHydrateInstaller(state, cleanup);
	state.prefetchCleanup = null;
}

/**
 * Dispose a strategy or prefetch installer. A root render disposes it as it
 * commits, so a render that drops, such as a transition that suspends, keeps
 * the island's subscriptions with its still-visible server DOM.
 */
function disposeHydrateInstaller(state: HydrateSlot, cleanup: () => void): void {
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK) {
		transaction.ops.push(runHydrateInstallerCleanup, cleanup);
		journalObjectOnce(state);
	} else cleanup();
}

function runHydrateInstallerCleanup(cleanup: () => void): void {
	cleanup();
}

function invalidateHydrateActivation(state: HydrateSlot): void {
	cleanupHydrateStreamWait(state);
	state.activationGeneration++;
	state.activationRequested = false;
	state.activationReady = false;
	if (state.serverPreserved) {
		// Once server activation enters the internal try slot, its Suspense resume
		// listener is independent of the request generation above. Supersede that
		// listener without removing the visible preserved-server pending block, and
		// let a later non-never strategy start a fresh activation attempt.
		const activationSlot = state.block.slots[0] as TrySlot | undefined;
		if (activationSlot?.__kind === 'trySlotSlot') activationSlot.pendingThenable = null;
		state.serverActivationStarted = false;
	}
	// An interaction that requested the cancelled activation must not replay if
	// the boundary is changed away from never() again at some later point.
	state.replays = [];
}

export function teardownHydrateBoundary(state: HydrateSlot): void {
	state.initialCaptures = null;
	cleanupHydrateInstallers(state);
	cleanupHydrateStreamWait(state);
	// load() can start procedural prefetch before passive setup, so settle it here.
	state.prefetchAbort?.abort();
	resolveHydrateWaiters(state, 'abort');
	unregisterHydrationIntentBoundary(state.wrapper, state.intentBoundary);
}

function resolveEventPath(root: Element, path: number[]): Element | null {
	const streamToken = root.getAttribute(HYDRATE_STREAM_TOKEN_ATTR);
	let node: Element = root;
	for (let i = 0; i < path.length; i++) {
		let index = path[i];
		let next = node.firstElementChild;
		while (next !== null) {
			if (!isRendererStreamBoundaryTemplate(next, streamToken)) {
				if (index === 0) break;
				index--;
			}
			next = next.nextElementSibling;
		}
		if (next === null) return null;
		node = next;
	}
	return node;
}

function hydrateMarkerInteractionEvents(marker: Element): ReadonlyArray<string> | null {
	const when = marker.getAttribute(HYDRATE_WHEN_ATTR);
	if (when === 'dynamic') return HYDRATE_SUPPORTED_INTERACTION_EVENTS;
	if (when !== 'interaction') return null;
	const custom = marker.getAttribute(HYDRATE_INTERACTION_EVENTS_ATTR);
	return custom === null ? HYDRATE_DEFAULT_INTERACTION_EVENTS : custom.split(/\s+/).filter(Boolean);
}

function hydrateStrategyInteractionEvents(
	strategy: HydrationStrategy,
): ReadonlyArray<string> | null {
	if (strategy._t !== 'interaction') return null;
	const custom = strategy._a?.()?.[HYDRATE_INTERACTION_EVENTS_ATTR];
	return custom === undefined
		? HYDRATE_DEFAULT_INTERACTION_EVENTS
		: custom.split(/\s+/).filter(Boolean);
}

function queueHydrateIntent(state: HydrateSlot, intent: HydrationReplayIntent): void {
	if (!state.hydrated && resolveHydrateStrategy(state)._t === 'never') return;
	if (!intent.earlyBinding) state.replays.push(intent);
	requestHydrateBoundary(state);
}

/**
 * A boundary hydrates in render but replays its captured intent from a passive
 * effect after commit. Until that replay drains, later intent must queue behind
 * it: let through, it would reach the hydrated handlers first.
 */
function hydrateBoundaryReleased(state: HydrateSlot): boolean {
	return state.hydrated && state.replays.length === 0;
}

function handleRegisteredHydrationIntent(
	state: HydrateSlot,
	eventType: string,
	intent?: HydrationReplayIntent,
): HydrationIntentBoundaryStatus {
	if (hydrateBoundaryReleased(state)) return 'hydrated';
	const strategy = resolveHydrateStrategy(state);
	if (strategy._t === 'never' && !state.hydrated) return 'never';
	const status = hydrateStrategyInteractionEvents(strategy)?.includes(eventType)
		? 'handles'
		: 'dormant';
	// Pointer movement and cancellation extend a requested activation; alone,
	// they never wake the boundary.
	if (intent !== undefined && (state.activationRequested || !isHydrationLifecycleEvent(eventType)))
		queueHydrateIntent(state, intent);
	return status;
}

function installHydrateInteraction(state: HydrateSlot, strategy: HydrationStrategy): () => void {
	const ownEvents =
		hydrateStrategyInteractionEvents(strategy) ??
		// A parent-first replay may carry conservative intent for a dynamic marker
		// whose strategy could not yet be evaluated. Resolved boundaries get none.
		(state.delegatedDynamicIntent ? HYDRATE_SUPPORTED_INTERACTION_EVENTS : []);
	const events = new Set<string>(ownEvents);
	const descendants = state.wrapper.querySelectorAll(HYDRATE_MARKER_SELECTOR);
	for (let i = 0; i < descendants.length; i++) {
		const nestedEvents = hydrateMarkerInteractionEvents(descendants[i]);
		if (nestedEvents !== null) {
			for (let j = 0; j < nestedEvents.length; j++) events.add(nestedEvents[j]);
		}
	}
	// Document capture owns pointer movement and cancellation: they extend only a
	// press it captured, not an activation requested for any other reason.
	for (let i = 0; i < HYDRATE_LIFECYCLE_INTERACTION_EVENTS.length; i++) {
		events.delete(HYDRATE_LIFECYCLE_INTERACTION_EVENTS[i]);
	}
	if (events.size === 0) return () => undefined;

	const onIntent = (event: Event) => {
		if (wasEarlyHydrationIntentHandled(event) || hydrateBoundaryReleased(state)) return;
		// Constructors belong to each window; iframe nodes need realm-neutral checks.
		const rawTarget = eventPathNode(event.target);
		const target =
			rawTarget?.nodeType === 1
				? (rawTarget as Element)
				: rawTarget !== null
					? rawTarget.parentElement
					: null;
		let marker: Element | null = target?.closest(HYDRATE_MARKER_SELECTOR) ?? state.wrapper;
		let matches = ownEvents.includes(event.type);
		const delegatedDynamicMarkers: Element[] = [];
		while (marker !== null && state.wrapper.contains(marker)) {
			if (marker !== state.wrapper) {
				const nestedEvents = hydrateMarkerInteractionEvents(marker);
				if (nestedEvents?.includes(event.type)) {
					matches = true;
					if (marker.getAttribute(HYDRATE_WHEN_ATTR) === 'dynamic') {
						delegatedDynamicMarkers.push(marker);
					}
				}
			}
			if (marker === state.wrapper) break;
			marker = marker.parentElement?.closest(HYDRATE_MARKER_SELECTOR) ?? null;
		}
		if (!matches) return;
		for (let i = 0; i < delegatedDynamicMarkers.length; i++) {
			markDelegatedDynamicHydrationIntent(delegatedDynamicMarkers[i]);
		}
		const path = hydrationEventPathWithin(state.wrapper, event.target);
		if (path === null) return;
		state.replays.push({ event, path });
		if (event.bubbles) {
			if (shouldPreventHydrationInteractionDefault(event)) event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		}
		requestHydrateBoundary(state);
	};
	for (const eventName of events) state.wrapper.addEventListener(eventName, onIntent, true);
	return () => {
		for (const eventName of events) state.wrapper.removeEventListener(eventName, onIntent, true);
	};
}

function isCanonicalHydrateIdCount(value: string | null): boolean {
	if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) return false;
	return Number.isSafeInteger(Number(value));
}

function isDormantServerHydrateOwner(element: Element, streamToken: string): boolean {
	return (
		element.localName === 'div' &&
		element.getAttribute(HYDRATE_STREAM_TOKEN_ATTR) === streamToken &&
		element.hasAttribute(HYDRATE_ID_ATTR) &&
		element.hasAttribute(HYDRATE_WHEN_ATTR) &&
		isCanonicalHydrateIdCount(element.getAttribute(HYDRATE_ID_COUNT_ATTR)) &&
		rendererRangeClose(getFirstChild(element)) !== null
	);
}

function hydrateStreamBoundaryOwnedByState(
	boundary: Element,
	state: HydrateSlot,
	streamToken: string,
): boolean {
	let owner = boundary.parentElement;
	while (owner !== null && owner !== state.wrapper) {
		// Only a complete token-bound server shape creates an ownership barrier.
		// Authored lookalike data attributes remain ordinary descendants.
		if (isDormantServerHydrateOwner(owner, streamToken)) return false;
		owner = owner.parentElement;
	}
	return owner === state.wrapper;
}

function hasPendingHydrateStreamReveal(state: HydrateSlot): boolean {
	const streamToken = state.wrapper.getAttribute(HYDRATE_STREAM_TOKEN_ATTR);
	if (!isRendererStreamToken(streamToken)) return false;
	// querySelector is the fast native rejection path for the overwhelmingly
	// common non-streamed boundary. Only pay the ownership/range-aware JS walk
	// after proving at least one renderer stream sentinel remains below it.
	if (state.wrapper.querySelector(HYDRATE_STREAM_BOUNDARY_SELECTOR) === null) return false;
	const walker = state.wrapper.ownerDocument.createTreeWalker(
		state.wrapper,
		HYDRATE_STREAM_SCAN_MASK,
	);
	let node: Node | null;
	while ((node = walker.nextNode()) !== null) {
		if (node.nodeType === 8) {
			const range = permanentStaticHydrationRangeEnd(node as Comment, streamToken);
			// The compiler-proven static range has no client owner. Skip its exact
			// balanced server range so a descendant reveal cannot block this boundary.
			if (range !== null) walker.currentNode = range.end;
			continue;
		}
		const boundary = node as Element;
		if (
			isRendererStreamBoundaryTemplate(boundary, streamToken) &&
			!boundary.hasAttribute(HYDRATE_STREAM_ERROR_ATTR) &&
			hydrateStreamBoundaryOwnedByState(boundary, state, streamToken)
		)
			return true;
	}
	return false;
}

function cleanupHydrateStreamWait(state: HydrateSlot): void {
	const cleanup = hydrateStreamWaitCleanups?.get(state);
	hydrateStreamWaitCleanups?.delete(state);
	cleanup?.();
}

/**
 * A dormant Hydrate boundary still leaves its server DOM under the streaming
 * renderer's ownership. If interaction opens it while a nested Suspense reveal
 * is pending, wait for the renderer to either swap that range or mark it for
 * client recovery. Pending ranges below another dormant Hydrate boundary belong
 * to that boundary instead and must not block this one.
 */
function beginHydrateStreamWait(state: HydrateSlot): Promise<void> | null {
	if (!state.serverPreserved || !hasPendingHydrateStreamReveal(state)) return null;

	return new Promise<void>((resolve) => {
		let settled = false;
		let observer!: MutationObserver;
		const finish = () => {
			if (settled) return;
			settled = true;
			observer.disconnect();
			if (hydrateStreamWaitCleanups?.get(state) === finish) hydrateStreamWaitCleanups.delete(state);
			resolve();
		};
		const MutationObserverImpl =
			state.wrapper.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
		observer = new MutationObserverImpl(() => {
			if (!hasPendingHydrateStreamReveal(state)) finish();
		});

		(hydrateStreamWaitCleanups ??= new WeakMap()).set(state, finish);
		observer.observe(state.wrapper, {
			attributes: true,
			attributeFilter: [HYDRATE_STREAM_ERROR_ATTR],
			childList: true,
			subtree: true,
		});
		// The reveal may have landed after the initial scan but before observation.
		if (!hasPendingHydrateStreamReveal(state)) finish();
	});
}

function requestHydrateBoundary(state: HydrateSlot): void {
	if (state.hydrated || state.activationRequested || state.block.disposed) return;
	// A direct strategy prop can become never() after an earlier installer was
	// registered. Its cleanup should cancel normal callbacks, but guard here too:
	// a queued/custom callback that escaped cleanup must not bypass never's
	// intentionally-static contract.
	if (resolveHydrateStrategy(state)._t === 'never') return;
	const activationGeneration = ++state.activationGeneration;
	state.activationRequested = true;
	resolveHydrateWaiters(state, 'hydrate');

	const waits: Promise<void>[] = [];
	const streamReveal = beginHydrateStreamWait(state);
	if (streamReveal !== null) waits.push(streamReveal);
	const prefetch = beginProceduralHydratePrefetch(state);
	if (prefetch !== null) waits.push(prefetch);
	const preload = beginHydratePreload(state);
	if (preload !== null) waits.push(preload);
	if (waits.length === 0) {
		state.activationReady = true;
		if (state.gate !== null) state.gate.resolved = true;
		if (CURRENT_BLOCK !== state.parentBlock) scheduleRender(state.parentBlock);
		return;
	}

	void Promise.all(waits).then(
		() => {
			if (
				state.block.disposed ||
				!state.activationRequested ||
				state.activationGeneration !== activationGeneration
			)
				return;
			state.activationReady = true;
			if (state.gate !== null) state.gate.resolved = true;
			scheduleRender(state.parentBlock);
		},
		(error) => {
			if (
				state.block.disposed ||
				!state.activationRequested ||
				state.activationGeneration !== activationGeneration
			)
				return;
			failHydrateBoundary(state, error);
		},
	);
}

function installHydrateBoundary(state: HydrateSlot): () => void {
	if (!state.serverPreserved || state.hydrated) return () => undefined;
	if (state.independent) return () => teardownHydrateBoundary(state);
	const strategy = resolveHydrateStrategy(state);
	if (strategy._t === 'never') {
		state.strategyCleanup = null;
	} else {
		const gate = {
			id: state.boundaryId,
			when: strategy._t,
			resolved: false,
			resolve: () => requestHydrateBoundary(state),
		};
		state.gate = gate;
		const strategyCleanup = strategy._s?.({ element: state.wrapper, gate });
		const interactionCleanup = installHydrateInteraction(state, strategy);
		state.strategyCleanup = () => {
			strategyCleanup?.();
			interactionCleanup();
		};
	}

	const prefetch = state.props.prefetch;
	if (typeof prefetch === 'function') {
		beginProceduralHydratePrefetch(state);
	} else if (prefetch !== undefined) {
		state.prefetchCleanup =
			prefetch._s?.({
				element: state.wrapper,
				prefetch: () => {
					const promise = beginHydratePreload(state);
					if (promise !== null) void promise.catch(() => undefined);
				},
			}) ?? null;
	}

	return () => teardownHydrateBoundary(state);
}

/** An island's server wrapper no longer carries the ID count its server render reserved. */
function dropHydrateIdCount(wrapper: Element): void {
	wrapper.removeAttribute(HYDRATE_ID_COUNT_ATTR);
}

/** A seed sidecar after an island's range, which the commit that claims the island removes. */
function isHydrateSeedSidecar(node: Node): boolean {
	return (
		node.nodeType === 1 &&
		(node as Element).localName === 'script' &&
		((node as Element).hasAttribute(HYDRATE_SEED_ATTR) ||
			(node as Element).hasAttribute(NATIVE_SIGNAL_SEED_ATTR))
	);
}

export function findHydrateSeedSidecar(
	wrapper: ParentNode,
	attribute = HYDRATE_SEED_ATTR,
): HTMLScriptElement | null {
	for (let node = wrapper.firstElementChild; node !== null; node = node.nextElementSibling) {
		if (node.localName === 'script' && node.hasAttribute(attribute)) {
			return node as HTMLScriptElement;
		}
	}
	return null;
}

function createHydrateSlot(
	props: InternalHydrateProps,
	scope: Scope,
	boundaryId: string,
	boundaryBody: typeof hydrateBoundaryBody,
): HydrateSlot {
	const parentBlock = scope.block;
	const parentNode = parentBlock.parentNode;
	const hydration = CURSOR;
	// The client render replacing a failed root hydration adopts an independent
	// island's server wrapper as hydration would have: the island's own root
	// still owns it, whether or not it has activated.
	const kept =
		hydrationStarted && props.__independent !== undefined ? keptHydrationIsland(boundaryId) : null;
	const expected = kept ?? document.createElement('div');
	const wrapper = (hydration === null ? expected : hydration.clone(expected)) as HTMLDivElement;
	initializeHydrationEventCapture(wrapper.ownerDocument);
	const serverPreserved =
		kept !== null || (hydration !== null && wrapper.parentNode === parentNode);
	// A server wrapper names its boundary already; a client one is named before
	// it is placed.
	if (!serverPreserved) {
		wrapper.setAttribute(HYDRATE_ID_ATTR, boundaryId);
		wrapper.setAttribute(HYDRATE_WHEN_ATTR, hydrateStrategyType(props.when));
		if (props.__independent !== undefined) wrapper.setAttribute(HYDRATE_INDEPENDENT_ATTR, '');
	}
	if (hydration !== null) hydration.insertRoot(wrapper, parentBlock);
	else {
		// The kept server wrapper stays where the server put it until the commit
		// moves it to its place in the client render (placeKeptIsland). A client
		// wrapper built where its parent's DOM is committed lands from a frontier.
		const place = kept === null ? null : document.createComment('');
		if (usesFrontier(parentBlock, parentNode))
			queueFrontier(parentBlock, parentNode, parentBlock.endMarker).appendChild(place ?? wrapper);
		else parentNode.insertBefore(place ?? wrapper, parentBlock.endMarker);
		if (place !== null) atCommit(placeKeptIsland, [place, wrapper]);
	}

	let start: Comment | null = null;
	let end: Comment | null = null;
	let seedRaw: string | null = null;
	let nativeSeedRaw: string | null = null;
	let idState = parentBlock.idState;
	if (serverPreserved) {
		const rawCount = wrapper.getAttribute(HYDRATE_ID_COUNT_ATTR);
		const parsedCount = rawCount === null ? 0 : Number(rawCount);
		const idCount = Number.isSafeInteger(parsedCount) && parsedCount >= 0 ? parsedCount : 0;
		const rootIds = parentBlock.idState;
		const childStart = rootIds.next;
		rootIds.next += idCount;
		idState = {
			prefix: rootIds.prefix,
			next: childStart,
			signalState: rootIds.signalState,
			limit: childStart + idCount,
			overflow: rootIds,
			renderOwner: rootIds.renderOwner,
		};
		// The commit drops the count, so the attempt that replaces a dropped one,
		// a retry or the fallback's client render adopting an independent wrapper,
		// reserves the same IDs.
		atCommit(dropHydrateIdCount, wrapper);
	}
	// An independent root may already have compacted its server ranges. The
	// parent reserves its IDs but owns only the wrapper, never its child list or
	// seed sidecars, regardless of which root hydrates first.
	if (props.__independent !== undefined) {
		// No parent-owned content range.
	} else if (serverPreserved && isBlockOpen(getFirstChild(wrapper))) {
		start = getFirstChild(wrapper) as Comment;
		end = hydration!.close(start);
		// The commit removes the sidecars, which an attempt that replaces a
		// dropped one reads again.
		const seed = findHydrateSeedSidecar(wrapper);
		if (seed !== null) {
			seedRaw = seed.textContent || '[]';
			atCommit(removeNodes, [seed]);
		}
		const nativeSeed = findHydrateSeedSidecar(wrapper, NATIVE_SIGNAL_SEED_ATTR);
		if (nativeSeed !== null) {
			nativeSeedRaw = nativeSeed.textContent || '';
			atCommit(removeNodes, [nativeSeed]);
		}
	} else {
		// The server opens every ordinary wrapper with the boundary's own range. An
		// adopted element without one is not this boundary's server output: the
		// server rendered something else here, a mismatch that the enclosing owner
		// falls back for, discarding this element, as React's parent does for a
		// Suspense boundary whose server marker is missing.
		if (serverPreserved) {
			// DEV: the nearest component that renders the island names the mismatch.
			let loc: string | undefined;
			if (process.env.NODE_ENV !== 'production')
				for (
					let block = parentBlock.parentBlock;
					block !== null && loc === undefined;
					block = block.parentBlock
				)
					loc = componentSourceLoc(block.body);
			hydration!.fail(loc, () => 'a Hydrate boundary range', getFirstChild(wrapper));
		}
		start = document.createComment('hydrate');
		end = document.createComment('/hydrate');
		wrapper.append(start, end);
	}

	const block = createBlock(
		'control-flow',
		parentBlock,
		wrapper,
		start,
		end,
		() => undefined,
		undefined,
	);
	block.idState = idState;
	let state!: HydrateSlot;
	const intentBoundary: HydrationIntentBoundary = (eventType, intent) =>
		handleRegisteredHydrationIntent(state, eventType, intent);
	state = {
		__kind: 'hydrateBlockSlot',
		__flags: SLOT_FLAG_TEARDOWN,
		__teardown: teardownHydrateBoundary,
		block,
		wrapper,
		start,
		end,
		parentBlock,
		props,
		contextChanged: false,
		boundaryId: wrapper.getAttribute(HYDRATE_ID_ATTR) ?? boundaryId,
		intentBoundary,
		delegatedDynamicIntent: takeDelegatedDynamicHydrationIntent(wrapper),
		serverPreserved,
		seedRaw,
		idState,
		dynamicStrategy: null,
		strategy: null,
		gate: null,
		strategyCleanup: null,
		prefetchCleanup: null,
		prefetchAbort: null,
		prefetchStarted: false,
		prefetchPromise: null,
		preloadPromise: null,
		loadedBody: null,
		hydrationWaiters: null,
		activationGeneration: 0,
		activationRequested: !serverPreserved,
		activationReady: !serverPreserved,
		serverActivationStarted: false,
		hydrated: false,
		didNotify: false,
		hasError: false,
		error: undefined,
		replays: [],
		independent: props.__independent !== undefined,
		initialCaptures: null,
		next: null,
	};
	if (nativeSeedRaw !== null) state.nativeSeedRaw = nativeSeedRaw;
	if (serverPreserved && !state.independent) {
		state.initialCaptures = {
			props,
			contexts: collectHydrateContexts(scope),
			contextEpoch: EPOCH_CELL.value,
		};
	}
	scope.slots[0] = state;
	registerSlot(scope, state);
	if (!state.independent) registerHydrationIntentBoundary(wrapper, intentBoundary);
	block.body = boundaryBody(state);
	const initialStrategy = resolveHydrateStrategy(state);
	const pendingIntents = state.independent ? undefined : takePendingHydrationIntents(wrapper);
	if (state.independent) {
		// bootstrapIndependentHydration owns the preserved children and intent
		// listener. The parent root retains only the wrapper's outer lifetime.
	} else if (serverPreserved && pendingIntents !== undefined && initialStrategy._t !== 'never') {
		state.replays.push(...pendingIntents.filter((intent) => !intent.earlyBinding));
		requestHydrateBoundary(state);
	} else if (serverPreserved) {
		const shouldDefer = initialStrategy._d ? initialStrategy._d() : initialStrategy._t !== 'load';
		if (!shouldDefer && initialStrategy._t !== 'never') requestHydrateBoundary(state);
	}
	return state;
}

/**
 * After a Hydrate island's content adopted its server range, a server node
 * left after that range in the island's wrapper is content the client renders
 * nothing for: a mismatch, which the island falls back from. Renderer style
 * and seed sidecars are not content.
 */
export function settleHydrateTail(hydration: HydrationCapability, end: Node): void {
	let node = getNextSibling(end);
	while (node !== null && (isRendererHydrationStyle(node) || isHydrateSeedSidecar(node)))
		node = getNextSibling(node);
	if (node === null) return;
	hydration.fail(
		process.env.NODE_ENV !== 'production'
			? componentSourceLoc(hydration.rootBlock.body)
			: undefined,
		() => 'the end of the root',
		node,
	);
}

/**
 * An island that falls back discards the server nodes after its range in its
 * wrapper too, the unmatched content that failed its hydration (settleHydrateTail),
 * as React deletes a dehydrated boundary's whole content. A renderer's
 * hydration style is not content.
 */
export function discardHydrateTail(state: HydrateSlot, atCommit = false): void {
	const end = state.end!;
	const wrapper = end.parentNode;
	let node = getNextSibling(end);
	if (wrapper === null || node === null) return;
	markHydrationDiscard(state.block.idState.renderOwner, wrapper, node, null);
	while (node !== null) {
		const next = getNextSibling(node);
		if (isRendererHydrationStyle(node) || isHydrateSeedSidecar(node)) {
			// Kept: the commit that claims the island removes a sidecar.
		} else if (atCommit) slotNext(state).out.push(null, node, node);
		else wrapper.removeChild(node);
		node = next;
	}
}

/**
 * Point an island's Block at a frontier for its client fallback: the commit
 * removes the server's nodes in its range, inserts the client render before
 * the range's end and gives the Block back its markers.
 */
export function fallBackOffDocument(state: HydrateSlot): void {
	const block = state.block;
	const end = state.end!;
	const first = getNextSibling(state.start!);
	if (first !== end) slotNext(state).out.push(null, first, end.previousSibling);
	const frag = slotFrontier(state, state.parentBlock, state.wrapper, end);
	journalRootProperty(block, 'parentNode', block.parentNode);
	journalRootProperty(block, 'startMarker', block.startMarker);
	journalRootProperty(block, 'endMarker', block.endMarker);
	block.parentNode = frag;
	block.startMarker = block.endMarker = null;
	noteFrontierMember(frag, block);
	ROOT_RENDER_TRANSACTION!.ops.push(restoreHydrateRange, state);
}

function restoreHydrateRange(state: HydrateSlot): void {
	if (state.block.disposed) return;
	state.block.startMarker = state.start;
	state.block.endMarker = state.end;
}

function notifyHydrateBoundary(state: HydrateSlot, scope: Scope): void {
	if (state.block.disposed || state.didNotify || !state.hydrated) return;
	const retryBatch = suspenseRetryBatchForSubtree(state.block);
	if (retryBatch !== null) {
		// A client fallback can finish adoption before its already-ready primary
		// commits. Replaying captured intent now would dispatch into that fallback
		// and lose the interaction. Wait for this subtree's retry (or supersession),
		// then replay this same passive effect after the revealed child's effects.
		// Use the slot's effective key, including any custom-hook namespace.
		const effect = scope.effectSlots!.find((entry) => entry.connectedFn === notifyHydrateBoundary)!;
		(retryBatch.afterCommit ??= []).push(() => {
			if (scope.block.disposed || state.didNotify || !effect.active) return;
			requeuePassiveEffect(scope, effect);
		});
		return;
	}
	state.didNotify = true;
	state.initialCaptures = null;
	// Keep intent capture alive while an asynchronously split child loads. A
	// pointerdown commonly requests hydration before the browser dispatches the
	// corresponding click; removing listeners at request time would lose that
	// click instead of replaying the complete interaction once hydration commits.
	cleanupHydrateInstallers(state);
	state.props.onHydrated?.();
	state.wrapper.removeAttribute(HYDRATE_WHEN_ATTR);
	state.strategy?._o?.(state.boundaryId);
	const replays = state.replays;
	state.replays = [];
	for (let i = 0; i < replays.length; i++) {
		const replay = replays[i];
		const originalTarget = replay.event.target;
		// Intent captured on server DOM that a fallback discarded is dropped, as
		// React drops the replays of a boundary it renders on the client.
		if (
			originalTarget !== null &&
			typeof (originalTarget as Node).nodeType === 'number' &&
			discardedByHydration(originalTarget as Node)
		)
			continue;
		// A streamed reveal can change the number of elements before an unrelated
		// live sibling. Preserve exact intent whenever its original element survived;
		// the filtered logical path remains the fallback for replaced server arms.
		const target =
			originalTarget !== null &&
			typeof (originalTarget as Node).nodeType === 'number' &&
			(originalTarget as Node).nodeType === 1 &&
			state.wrapper.contains(originalTarget as Node)
				? (originalTarget as Element)
				: resolveEventPath(state.wrapper, replay.path);
		if (target !== null) {
			const event = replay.event;
			// `click` is the platform exception among untrusted events: dispatching
			// the clone still runs its native activation behavior, so links navigate
			// and submit controls submit unless a hydrated handler prevents default.
			// Keep dispatchEvent here to preserve native activation and cancellation.
			target.dispatchEvent(cloneHydrationReplayEvent(event, target));
		}
	}
}

/**
 * Defer the initial hydration of server-rendered children until `when` resolves.
 * An ordinary boundary first mounted on the client renders immediately; only
 * existing SSR HTML can be left dormant. The compiler-proven permanent-static
 * form is the server-only exception and intentionally renders no client child.
 */
type InternalHydrateComponent = ComponentBody<HydrateProps> & {
	readonly __octanePermanentStatic: ComponentBody<HydrateProps>;
};

export const __PermanentStaticHydrate = /* @__PURE__ */ markComponentFlags<
	ComponentBody<HydrateProps>
>(
	function PermanentStaticHydrate(_props, scope) {
		// Match Hydrate's own server useId while leaving all child IDs to the
		// paired private sidecar. The componentSlot's adopted outer range owns
		// the untouched server DOM across parent updates and unmount.
		useId(HYDRATE_ID_SLOT);
		preservePermanentStaticHydrationRange(scope);
	},
	COMPONENT_FLAG_BOUNDARY,
	'PermanentStaticHydrate',
);

function initializeHydrateComponent(
	boundaryBody: typeof hydrateBoundaryBody,
): InternalHydrateComponent {
	const hydrate = markComponentFlags<ComponentBody<HydrateProps>>(
		function Hydrate(rawProps, scope) {
			const props = rawProps as InternalHydrateProps;
			const boundaryId = useId(HYDRATE_ID_SLOT);
			let state = scope.slots[0] as HydrateSlot | undefined;
			let renderedChild = false;
			if (state === undefined) {
				state = createHydrateSlot(props, scope, boundaryId, boundaryBody);
			} else {
				if (state.independent !== (props.__independent !== undefined)) {
					throw new Error(formatClientError(66));
				}
				const surroundingUpdate = state.props !== props || state.contextChanged;
				state.props = props;
				// Parent/capture or context updates can stale preserved HTML. An unchanged
				// native refresh instead rechecks the strategy and retains its subscriptions.
				// A client-only boundary has no server HTML to gate: like its first mount
				// and installHydrateBoundary, it ignores the strategy, so a pending render
				// re-enters with new props instead of leaving them to a promise replay.
				if (!state.independent && !state.hydrated && state.serverPreserved) {
					const strategy = resolveHydrateStrategy(state);
					if (strategy._t === 'never') {
						// Only the hydration trigger changes here. Preparation has an independent
						// lifecycle, so do not abort procedural prefetch or resolve waitFor() as
						// though the still-mounted boundary had unmounted.
						cleanupHydrateStrategy(state);
						invalidateHydrateActivation(state);
					} else if (!state.activationRequested) {
						const shouldDefer = surroundingUpdate
							? false
							: strategy._d
								? strategy._d()
								: strategy._t !== 'load';
						if (!shouldDefer) requestHydrateBoundary(state);
					}
				}
			}

			if (state.independent) {
				useEffect(() => installHydrateBoundary(state!), [state], HYDRATE_SETUP_SLOT);
				return;
			}
			if (state.hasError) throw state.error;
			if (
				!state.hydrated &&
				state.activationReady &&
				(!state.serverPreserved || !state.serverActivationStarted)
			) {
				// A suspended first attempt keeps its adopted server arm connected until
				// its own gated resume requests another pass. Client-only boundaries keep
				// re-entering so new props can supersede suspended data.
				if (state.serverPreserved) state.serverActivationStarted = true;
				try {
					activateHydrateBoundary(state);
				} catch (error) {
					// A synchronous render error did not leave a resumable try path behind.
					// Let an enclosing error boundary retry this activation after reset.
					if (state.serverPreserved) state.serverActivationStarted = false;
					throw error;
				}
				renderedChild = true;
			} else if (state.hydrated && !renderedChild) {
				renderBlock(state.block);
			}

			useEffect(() => installHydrateBoundary(state!), [state], HYDRATE_SETUP_SLOT);
		},
		COMPONENT_FLAG_BOUNDARY,
		'Hydrate',
	);
	Object.defineProperty(hydrate, '__octanePermanentStatic', { value: __PermanentStaticHydrate });
	return hydrate as InternalHydrateComponent;
}

export const Hydrate: ComponentBody<HydrateProps> = /* @__PURE__ */ rollbackEntry(
	/* @__PURE__ */ initializeHydrateComponent(hydrateBoundaryBody),
);

/** Compiler-owned template children with no authored fallback; never a descriptor entry point. */
export const __HydrateCompiled: ComponentBody<HydrateProps> = /* @__PURE__ */ rollbackEntry(
	/* @__PURE__ */ initializeHydrateComponent(compiledHydrateBoundaryBody),
);
