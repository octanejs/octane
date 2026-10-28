// Hooks
//
// Hook slots keyed by call site, and the state, reducer, linked state, effect,
// layout snapshot, memo, compiler memo, ref, imperative handle, store and id
// hooks.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './view-transition.js';
import { resolveHookPath } from '../hook-slot-cache.js';
import type {
	LayoutSnapshotOptionsWithInitial,
	LayoutSnapshotOptions,
} from '../layout-snapshot-types.js';
import { __profileResolveHook, __profileSchedule, __profileCacheHit } from '../profiling.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { formatUseId } from '../hydration-protocol.js';
import type { NativeReadWitness } from '../signals/native-read-collector.js';
import { createSignalHookSites } from '../signals/declaration-path.js';
import type {
	EffectFn,
	Cleanup,
	HookSlot,
	Scope,
	CompilerMemoRegion,
	Block,
	QueuedCell,
	TransitionActionBatch,
	StoreInst,
} from './types.js';
import {
	TRANSITION_ROOT_DRIVER,
	resolveSlot,
	MANUAL_HOOK_DRIVER,
	invokeManualHook,
	ROOT_RENDER_ROLLBACK,
	TRANSITION_JOURNAL,
} from './drivers.js';
import { compilerMemoPass, captureRenderPhaseUpdate } from './signal-owners.js';
import { storeSyncQueue } from './refs.js';
import {
	TRANSITION_HOLDERS,
	type EffectEventCommitAction,
	UPDATE_DEPTH_CAUSES,
	scheduleRender,
	readStateHook,
	LAYOUT_SNAPSHOT_CHANGES,
	countLayoutSnapshotChange,
	WARM_EVER,
	recordRealWarmMemo,
} from './engine.js';
import { PASSIVE, LAYOUT, INSERTION, checkStoreChanged } from './effects.js';
import { type WarmEntry, WARM_MISS, claimWarmMemoRecord, adoptWarmEntry } from './use.js';
import {
	type HookUpdate,
	transitionActionBatchForUpdate,
	inTransitionRender,
	setMemoEntry,
} from './transitions.js';
import { enqueueEffectEventCommitAction } from './block.js';
import { type ScheduledVisibilityOwner, findSuspenseHiddenTry } from './suspense.js';
import {
	CURRENT_SCOPE,
	CURRENT_BLOCK,
	CURRENT_WARM_EPISODE,
	ROOT_RENDER_TRANSACTION,
	WIP_CAPTURE,
	enqueueEffect,
} from './render.js';
import { HMR } from './component-slots.js';
import { NATIVE_REFLECT_APPLY } from './child-slots.js';
import { JOURNAL_PROP } from './commit.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

/**
 * Lazy allocator for the per-scope hook map. Returns the existing Map or
 * creates one on first use. Hook write sites should call this; hook read
 * sites use `scope.hooks?.get(slot)` directly (undefined return matches a
 * Map-miss).
 */
export function ensureHooks(scope: Scope): Map<HookSlot, any> {
	return scope.hooks ?? (scope.hooks = new Map());
}

// HMR retains hook cells, so tag their long-lived subscriptions/listeners with
// the existing HMR symbol. A refresh can then run render-owned cleanups while
// preserving these entries without adding a field to every Scope.
export function registerHookCleanup(scope: Scope, cleanup: Cleanup): void {
	if (process.env.NODE_ENV !== 'production') {
		// A lightweight child uses a host proxy without a component body. Its
		// cleanup belongs to that child; refreshing the parent disposes it. A
		// `memo(hmr(fn))` block's body is the memo wrapper around the hot one.
		const body = scope.block.body as any;
		if (body?.[HMR] !== undefined || body?.type?.[HMR] !== undefined) {
			(cleanup as Cleanup & { [HMR]?: true })[HMR] = true;
		}
	}
	(scope.cleanups ??= []).push(cleanup);
}

// Production helper/custom-hook ABI: reserve a disjoint numeric range for each
// evaluated module. Base-hook slots and compiler memo regions also need module
// ownership: Providers and lazy wrappers may run different bodies in one Scope.
// Evaluation order is irrelevant; reserved ranges never overlap,
// including duplicate/dynamically loaded module instances.
let nextHookSlot = 0;
export function hookSlots(count: number): number {
	const base = nextHookSlot;
	nextHookSlot += count;
	return base;
}

// ---------------------------------------------------------------------------
// Hooks — keyed by a compile-time site id
//
// The `slot` argument is COMPILER-INJECTED. octane/compiler appends a
// small number in production and a stable Symbol in HMR/profile output. The
// key gives the hook its per-call-site identity within a scope; Symbols retain
// cross-module/re-import identity where custom-hook forwarding or HMR needs it.
// The public signature marks `slot` OPTIONAL so authors writing `useState(0)`
// don't see a confusing "Expected 2 arguments" diagnostic. At runtime the
// missingSlot guard catches source loaded outside the compiler pipeline.
// ---------------------------------------------------------------------------

export function missingSlot(name: string): never {
	throw new Error(formatClientError(15, name));
}

// withSlot — establishes hook call-site identity via a per-render PATH STACK, so a
// hook reached THROUGH a custom-hook wrapper combines the wrapper's call-site symbol
// with its own. The compiler wraps CUSTOM hook calls only, as
// `withSlot(sym, hook, ...args)` — the authored args pass through directly (no
// per-render closure to allocate or extra argument to alter foreign defaults).
// BASE hooks keep
// the plain trailing-slot form (`useState(0, sym)`); inside a wrapper, resolveSlot
// folds the path in. Two calls to the same custom hook push DIFFERENT call-site
// symbols → different paths → independent state; a hook in a plain JS loop would
// repeat one call-site symbol, so the compiler rejects it (rejectHookInJsLoop in
// compile.js — the keyed `@for` template block is the supported loop: each item
// renders in its own scope).
export const slotStack: HookSlot[] = [];

/** @internal Adapt an expression provider that owns the trailing hook-slot ABI. */
export function manualHook<F extends (...args: any[]) => any>(fn: F, name?: string): F {
	function provider(this: unknown) {
		return invokeManualHook(fn, this, arguments);
	}
	Object.defineProperty(provider, 'name', { value: name ?? fn.name, configurable: true });
	Object.defineProperty(provider, 'length', { value: fn.length, configurable: true });
	return provider as F;
}

/** Invoke a cached optional-chain method without consulting its call/bind properties. */
export function callWithReceiver<T>(
	fn: (...args: any[]) => T,
	receiver: unknown,
	...args: any[]
): T {
	return NATIVE_REFLECT_APPLY(fn, receiver, args);
}

/**
 * @internal Register a signal-aware custom-hook call site. Its position-hashed
 * site keys instance declarations reached through that call, so two calls of one
 * hook own separate cells with identities that match between server and client.
 */
export const signalHookSite = /* @__PURE__ */ createSignalHookSites(slotStack);

// Length-prefix each segment so a numeric site cannot collide with a described
// Symbol and descriptions containing delimiters cannot alias a different path.
function appendSlotKey(key: string, slot: HookSlot): string {
	const value = typeof slot === 'number' ? String(slot) : (slot.description ?? '');
	return key + (typeof slot === 'number' ? 'n' : 's') + value.length + ':' + value;
}

// Resolve a base hook's effective slot by COMBINING its own per-call-site symbol
// (the compiler-injected trailing arg, when present) with the call-site PATH STACK
// (the symbols withSlot pushes for each enclosing custom-hook call). At the top
// level the stack is empty, so the hook's own slot is used unchanged — no behavior
// change for ordinary component hooks. Inside a withSlot-wrapped custom hook, the
// wrapper's call-site symbol is folded in, so the SAME custom hook used at two call
// sites (or reused) keeps its inner hooks independent. A base hook with no slot of
// its own (a hand-written or library-binding base hook) falls back to the path.
export function resolveCustomSlot(slot: HookSlot | undefined): HookSlot | undefined {
	const n = slotStack.length;
	if (n === 0) return slot;
	if (slot === undefined && n === 1) return slotStack[0];
	const resolved = resolveHookPath(slotStack, slot, false);
	return typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
		? __profileResolveHook(resolved, typeof slot === 'symbol' ? slot : undefined)
		: resolved;
}

/** @internal Optional native hooks use the existing compiler slot and Scope lifetime. */
export function nativeLocalHook<T>(
	name: string,
	initialize: () => T,
	dispose: (value: T) => void,
	slot?: HookSlot,
): T {
	slot = resolveSlot(slot);
	if (slot === undefined || CURRENT_SCOPE === null) missingSlot(name);
	const scope = CURRENT_SCOPE!;
	let cell = scope.hooks?.get(slot) as { nativeValue: T } | undefined;
	if (cell === undefined) {
		cell = { nativeValue: initialize() };
		ensureHooks(scope).set(slot, cell);
		const value = cell.nativeValue;
		registerHookCleanup(scope, () => dispose(value));
	}
	return cell.nativeValue;
}

export interface StateSlot<T> extends QueuedCell {
	value: T;
	setter: (next: T | ((prev: T) => T)) => void;
	/** Allocated only for compiler-selected third-tuple consumers. */
	getter: (() => T) | undefined;
}

export type StateSetter<T> = (next: T | ((prev: T) => T)) => void;
type StateTuple<T> = [T, StateSetter<T>, () => T];

type HookReducer = ((state: any, action: any) => any) | null;

function applyHookUpdate(state: unknown, action: unknown, reducer: HookReducer): unknown {
	return reducer !== null
		? reducer(state, action)
		: typeof action === 'function'
			? (action as (previous: unknown) => unknown)(state)
			: action;
}

/**
 * Fold `cell`'s queue for the Block rendering it. Urgent updates always apply,
 * and so do ready transition batches: an urgent update to a component whose
 * transition is waiting renders that work with it. A pending cue (CUE_RENDERS)
 * leaves it for the transition render, and nothing folds a held batch until
 * its holder retries it. From the first skipped update on, every update stays
 * queued over the base state before it, so a later render rebases them in
 * order (React's processUpdateQueue). Inside a root transaction the result is
 * published at commit (commitHookCells), so a dropped render leaves the queue
 * as it was.
 */
export function foldHookQueue(cell: QueuedCell, reducer: HookReducer): any {
	const transaction = ROOT_RENDER_TRANSACTION;
	const transition = CURRENT_BLOCK!.currentRenderMode === 'transition';
	let value = cell.base;
	let start = cell.queue;
	// A cell this transaction already folded continues from that fold, as if it
	// had committed: a render-phase retry reduces only its new actions, with the
	// reducer of the pass that queued them (React's rerenderReducer).
	const prior = transaction !== null && cell.stamp === transaction.createdStamp ? cell.at : -1;
	if (prior !== -1) {
		const cells = transaction!.cells!;
		const priorSkipped = cells[prior + 3] as HookUpdate | null;
		start = priorSkipped ?? (cells[prior + 4] as HookUpdate).next;
		if (start === null) return cells[prior + 1];
		value = cells[priorSkipped === null ? prior + 1 : prior + 2];
	}
	let base = value;
	let skipped: HookUpdate | null = null;
	let seen = start!;
	for (let update: HookUpdate | null = seen; update !== null; update = update.next) {
		seen = update;
		const batch = update.batch;
		if (
			batch === null ||
			(TRANSITION_ROOT_DRIVER && TRANSITION_ROOT_DRIVER.fold(batch, transition, transaction))
		) {
			value = applyHookUpdate(value, update.action, reducer);
			if (skipped === null) base = value;
		} else skipped ??= update;
	}
	if (transaction === null) publishHookCell(cell, value, base, skipped, seen);
	else if (prior !== -1) {
		const cells = transaction.cells!;
		cells[prior + 1] = value;
		cells[prior + 2] = base;
		cells[prior + 3] = skipped;
		cells[prior + 4] = seen;
	} else {
		const cells = (transaction.cells ??= []);
		cell.stamp = transaction.createdStamp;
		cell.at = cells.length;
		cells.push(cell, value, base, skipped, seen);
	}
	return value;
}

/**
 * Blocks rendering a pending cue at urgent priority, innermost last: an urgent
 * ancestor's render of a child whose transition waits, or a split cue. Their
 * own hook cells show the committed state without the waiting transition work
 * (keepTransitionWork).
 */
export const CUE_RENDERS: Block[] = [];

/** Commit one fold: `seen` is its newest update, so later updates stay queued. */
function publishHookCell(
	cell: QueuedCell,
	value: unknown,
	base: unknown,
	skipped: HookUpdate | null,
	seen: HookUpdate,
): void {
	cell.value = value;
	cell.base = base;
	const queue = skipped ?? seen.next;
	cell.queue = queue;
	if (queue === null) cell.last = null;
}

/** A committed transaction publishes its folds in render order, so the last wins. */
export function commitHookCells(cells: any[]): void {
	for (let i = 0; i < cells.length; i += 5)
		publishHookCell(cells[i], cells[i + 1], cells[i + 2], cells[i + 3], cells[i + 4]);
}

/** The latest scheduled state: every queued update, whatever its batch. */
export function latestHookValue(cell: QueuedCell, reducer: HookReducer): any {
	if (cell.queue === null) return cell.value;
	let value = cell.base;
	let start: HookUpdate | null = cell.queue;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null && cell.stamp === transaction.createdStamp) {
		// Continue from this transaction's fold (foldHookQueue).
		const cells = transaction.cells!;
		const skipped = cells[cell.at + 3] as HookUpdate | null;
		start = skipped ?? (cells[cell.at + 4] as HookUpdate).next;
		value = cells[skipped === null ? cell.at + 1 : cell.at + 2];
	}
	for (let update = start; update !== null; update = update.next)
		value = applyHookUpdate(value, update.action, reducer);
	return value;
}

function enqueueHookUpdate(
	cell: QueuedCell,
	batch: TransitionActionBatch | null,
	action: unknown,
): void {
	const update: HookUpdate = { batch, action, next: null };
	const last = cell.last;
	if (last === null) {
		cell.queue = update;
		cell.base = cell.value;
	} else last.next = update;
	cell.last = update;
}

/**
 * Queue an update the owner's render computes. Urgent work schedules that
 * render now; transition work renders when its batch is ready.
 */
export function queueHookUpdate(
	cell: QueuedCell,
	block: Block,
	batch: TransitionActionBatch | null,
	action: unknown,
	type: 'state' | 'reducer',
	slot: HookSlot,
): void {
	if (CURRENT_BLOCK === block) captureRenderPhaseUpdate(cell);
	enqueueHookUpdate(cell, batch, action);
	if (batch === null) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileSchedule(block, type, slot);
		scheduleRender(block);
	} else TRANSITION_ROOT_DRIVER!.queue(cell, batch, block, type, slot);
	if (TRANSITION_HOLDERS !== null && TRANSITION_HOLDERS.size !== 0) markRootUpdated(block);
}

/**
 * A user update outside render can unblock a held transition
 * (wakeHeldTransitions). Callers test TRANSITION_HOLDERS first, so an update
 * with nothing held makes no call.
 */
export function markRootUpdated(block: Block): void {
	if (CURRENT_BLOCK === null) TRANSITION_ROOT_DRIVER!.wake(block);
}

export function useState<T = undefined>(): StateTuple<T | undefined>;
export function useState<T>(initial: T | (() => T), slot?: HookSlot): StateTuple<T>;
export function useState<T>(initial?: T | (() => T), slot?: HookSlot): StateTuple<T> {
	const s = readStateHook(initial, slot, arguments.length === 1);
	// The compiler selects the getter variant only when the third member is observed.
	return [
		s.queue === null ? s.value : foldHookQueue(s, null),
		s.setter,
	] as unknown as StateTuple<T>;
}

/** Compiler-emitted useState variant for a tuple whose third member is observable. */
export function __useStateWithGetter<T>(initial: T | (() => T), slot?: HookSlot): StateTuple<T>;
export function __useStateWithGetter<T>(initial: T | (() => T), slot?: HookSlot): StateTuple<T> {
	const s = readStateHook(initial, slot, arguments.length === 1);
	const getter = (s.getter ??= () => latestHookValue(s, null));
	return [s.queue === null ? s.value : foldHookQueue(s, null), s.setter, getter];
}

/** The last successfully published source and its locally editable value. */
export interface LinkedStatePrevious<Source, Value> {
	source: Source;
	value: Value;
}

/** Equality customizations for a source-linked local state cell. */
export interface LinkedStateOptions<Source, Value> {
	sourceEqual?: (previous: Source, next: Source) => boolean;
	valueEqual?: ((previous: Value, next: Value) => boolean) | undefined;
}

interface LinkedStateSlot<Source, Value> extends QueuedCell {
	source: Source;
	value: Value;
	setter: StateSetter<Value>;
	getter?: () => Value;
	valueEqual?: ((previous: Value, next: Value) => boolean) | undefined;
	/** A source draft is visible to its rendering owner, never to committed readers. */
	renderPending?: boolean;
	renderSource?: Source | undefined;
	renderValue?: Value;
	renderValueEqual?: ((previous: Value, next: Value) => boolean) | undefined;
	renderSourceChanged?: boolean;
	/** Preserve only drafts explicitly edited by their rendering owner. */
	renderUpdated?: boolean;
	/** A completed draft is parked only after its hidden boundary defers publication. */
	renderParked?: boolean;
	/** Refresh the revealed owner after an outside update changed its parked draft. */
	renderNeedsRefresh?: boolean;
	renderPublish?: (() => void) | undefined;
	renderVersion?: number;
}

type LinkedStateTuple<Value> = [Value, StateSetter<Value>, () => Value];
/** A known `previous.value` type, else the reconciler's return type. */
type LinkedStateValue<Value, Previous> = unknown extends Previous ? Value : Previous;

// A sibling may finish before another sibling suspends their shared boundary.
// Keep linked-state publication and caught-error reports with their hidden owner
// (Suspense or Activity): completed bodies may bail when that owner reveals.
export interface HiddenRevealAction {
	action: EffectEventCommitAction;
	active: boolean;
	queue: HiddenRevealActionQueue;
}

interface HiddenRevealActionQueue {
	entries: HiddenRevealAction[];
	live: number;
}

export let HIDDEN_REVEAL_ACTIONS: WeakMap<
	ScheduledVisibilityOwner,
	HiddenRevealActionQueue
> | null = null;

export function deferHiddenRevealAction(
	boundary: ScheduledVisibilityOwner,
	action: EffectEventCommitAction,
): HiddenRevealAction {
	const deferred = (HIDDEN_REVEAL_ACTIONS ??= new WeakMap());
	let queue = deferred.get(boundary);
	if (queue === undefined) {
		queue = { entries: [], live: 0 };
		deferred.set(boundary, queue);
	}
	const entry = { action, active: true, queue };
	queue.entries.push(entry);
	queue.live++;
	return entry;
}

function claimHiddenRevealAction(
	boundary: ScheduledVisibilityOwner,
	entry: HiddenRevealAction,
): EffectEventCommitAction | null {
	const queue = entry.queue;
	if (HIDDEN_REVEAL_ACTIONS?.get(boundary) !== queue) return null;
	if (!entry.active) return null;
	entry.active = false;
	if (--queue.live === 0) HIDDEN_REVEAL_ACTIONS!.delete(boundary);
	return entry.action;
}

export function cancelHiddenRevealAction(
	boundary: ScheduledVisibilityOwner,
	entry: HiddenRevealAction,
): void {
	const queue = entry.queue;
	if (claimHiddenRevealAction(boundary, entry) === null || queue.live === 0) return;
	// Cancellation is cold and may happen repeatedly while an owner stays hidden.
	// Compact here so dead entries do not make a later reveal scan historical work.
	if (queue.entries.length > queue.live * 2) {
		queue.entries = queue.entries.filter((candidate) => candidate.active);
	}
}

export function publishHiddenRevealActions(boundary: ScheduledVisibilityOwner): void {
	const queue = HIDDEN_REVEAL_ACTIONS?.get(boundary);
	if (queue === undefined) return;
	const entries = queue.entries;
	if (boundary.__kind === 'activityBlockSlot') {
		// A visible Activity render can still be discarded by an outer Suspense.
		// Keep its parked work until a surviving commit consumes it; a retry may
		// already see visible mode even though the first reveal never committed.
		// Claim the snapshotted entry directly so a large surviving commit does not
		// repeatedly search and compact the remaining queue.
		const end = entries.length;
		for (let i = 0; i < end; i++) {
			const entry = entries[i];
			if (!entry.active) continue;
			enqueueEffectEventCommitAction(() => {
				const claimed = claimHiddenRevealAction(boundary, entry);
				if (claimed === null) return;
				return claimed();
			});
		}
		return;
	}
	HIDDEN_REVEAL_ACTIONS!.delete(boundary);
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry.active) enqueueEffectEventCommitAction(entry.action);
	}
}

/**
 * Local editable state linked to an external source. Source changes reconcile in
 * the same render instead of scheduling a render-phase setter/effect replay.
 * Publication uses the existing render/WIP transaction so a suspended subtree
 * cannot leak a speculative source or value into the previously committed tree.
 *
 * `Value` is the reconciler's return type and `Previous` is the type of
 * `previous.value`. They are separate type parameters because contextually
 * typing an unannotated `previous` fixes every type parameter its type names
 * before the callback body supplies a return type, so one parameter for both
 * became `unknown` whenever nothing else named it. `Previous` comes from an
 * annotated `previous`, typed options, or explicit type arguments, and
 * otherwise defaults to what `Value` has inferred so far. The linked value is
 * `Previous` when that is known and falls back to `Value`, so an unannotated
 * `previous.value` reads as `unknown` while the tuple keeps the returned type.
 * `Value extends Previous` keeps every returned value storable as
 * `previous.value`.
 */
export function useLinkedState<Source, Value extends Previous, Previous = Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Previous> | undefined) => Value,
	options?: LinkedStateOptions<Source, Previous>,
	slot?: HookSlot,
): LinkedStateTuple<LinkedStateValue<Value, Previous>>;
export function useLinkedState<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	options?: LinkedStateOptions<Source, Value> | symbol,
	slot?: HookSlot,
): LinkedStateTuple<Value> {
	// A plain compiled module appends its Symbol in the omitted options slot;
	// numeric-slot builds reserve that position and append the numeric fourth arg.
	if (typeof options === 'symbol') {
		if (slot === undefined) slot = options;
		options = undefined;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useLinkedState');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	const equalValue = options?.valueEqual;
	let state = scope.hooks?.get(slot) as LinkedStateSlot<Source, Value> | undefined;
	if (state === undefined) {
		const value = reconcile(source, undefined);
		state = {
			source,
			value,
			base: value,
			queue: null,
			last: null,
			stamp: 0,
			at: 0,
			valueEqual: equalValue,
			setter: (next) => {
				const renderingDraft = CURRENT_BLOCK === block && state!.renderPending === true;
				let updatingParkedDraft = false;
				if (
					!renderingDraft &&
					state!.renderPending === true &&
					transitionActionBatchForUpdate() === null
				) {
					updatingParkedDraft = state!.renderParked === true;
					if (!updatingParkedDraft && (block as any).__thenableDone === true) {
						const hiddenBoundary = findSuspenseHiddenTry(block);
						const publish = state!.renderPublish;
						if (hiddenBoundary !== null && publish !== undefined) {
							state!.renderParked = true;
							deferHiddenRevealAction(hiddenBoundary, publish);
							updatingParkedDraft = true;
						}
					}
				}
				const updatingDraft = renderingDraft || updatingParkedDraft;
				const previous = updatingDraft
					? (state!.renderValue as Value)
					: (latestHookValue(state!, null) as Value);
				const computed =
					typeof next === 'function' ? (next as (value: Value) => Value)(previous) : next;
				const equal = updatingDraft ? state!.renderValueEqual : state!.valueEqual;
				if ((equal ?? Object.is)(previous, computed)) return;
				if (updatingDraft) {
					state!.renderValue = computed;
					state!.renderUpdated = true;
					if (updatingParkedDraft) state!.renderNeedsRefresh = true;
					else scheduleRender(block);
					return;
				}
				// Select after evaluating the updater: user code can open an Action.
				const batch = transitionActionBatchForUpdate(block);
				if (batch !== null || state!.queue !== null) {
					queueHookUpdate(state!, block, batch, next, 'state', slot);
					return;
				}
				if (
					!block.disposed &&
					typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
					__OCTANE_PROFILE_ENABLED__
				)
					__profileSchedule(block, 'state', slot);
				state!.value = computed;
				scheduleRender(block);
				if (TRANSITION_HOLDERS !== null && TRANSITION_HOLDERS.size !== 0) markRootUpdated(block);
			},
		};
		ensureHooks(scope).set(slot, state);
		return [value, state.setter] as unknown as LinkedStateTuple<Value>;
	}

	const equalSource = options?.sourceEqual ?? Object.is;
	const sourceChanged = !equalSource(state.source, source);
	const reuseUpdatedDraft =
		state.renderPending === true &&
		state.renderUpdated === true &&
		state.renderSourceChanged === sourceChanged &&
		equalSource(state.renderSource as Source, source);
	const committed: Value = state.queue === null ? state.value : foldHookQueue(state, null);
	if (!reuseUpdatedDraft && !sourceChanged && state.valueEqual === equalValue) {
		// A previous failed render can have left a private draft behind. It was
		// never published, so a committed-source replay must discard it explicitly.
		state.renderPending = false;
		state.renderUpdated = false;
		state.renderSourceChanged = false;
		state.renderParked = false;
		state.renderNeedsRefresh = false;
		state.renderPublish = undefined;
		return [committed, state.setter] as unknown as LinkedStateTuple<Value>;
	}

	const reuseParkedDraft = reuseUpdatedDraft && state.renderParked === true;
	let value = reuseUpdatedDraft ? (state.renderValue as Value) : committed;
	if (sourceChanged && !reuseUpdatedDraft) {
		const previous = { source: state.source, value: committed };
		const reconciled = reconcile(source, previous);
		if (!(equalValue ?? Object.is)(committed, reconciled)) value = reconciled;
	}
	state.renderPending = true;
	state.renderSource = reuseUpdatedDraft
		? state.renderSource
		: sourceChanged
			? source
			: state.source;
	state.renderValue = value;
	state.renderValueEqual = equalValue;
	state.renderSourceChanged = sourceChanged;
	state.renderUpdated = reuseUpdatedDraft;
	state.renderParked = reuseParkedDraft;
	if (!reuseParkedDraft) state.renderNeedsRefresh = false;
	// A hidden retry can suspend and discard its fresh commit action. Keep the
	// original parked reveal action valid until this source draft is replaced.
	const version = reuseParkedDraft
		? (state.renderVersion as number)
		: (state.renderVersion = (state.renderVersion ?? 0) + 1);
	const current = state;
	const publish = () => {
		if (current.renderPending !== true || current.renderVersion !== version || block.disposed)
			return;
		// Updates still queued for the old source belong to its previous generation.
		// Discard them before parking too: otherwise they can fold into the
		// committed value while Suspense still hides the replacement source.
		if (sourceChanged && current.queue !== null) {
			current.queue = current.last = null;
			current.base = current.value;
		}
		const hiddenBoundary = findSuspenseHiddenTry(block);
		if (hiddenBoundary !== null) {
			current.renderParked = true;
			deferHiddenRevealAction(hiddenBoundary, publish);
			return;
		}
		current.source = current.renderSource as Source;
		current.value = current.renderValue as Value;
		current.valueEqual = current.renderValueEqual;
		const refresh = current.renderNeedsRefresh === true;
		current.renderPending = false;
		current.renderSourceChanged = false;
		current.renderUpdated = false;
		current.renderParked = false;
		current.renderNeedsRefresh = false;
		current.renderPublish = undefined;
		if (refresh) scheduleRender(block);
	};
	state.renderPublish = publish;
	enqueueEffectEventCommitAction(publish);
	return [value, state.setter] as unknown as LinkedStateTuple<Value>;
}

/** Compiler-selected linked-state variant when the current-value getter is observed. */
export function __useLinkedStateWithGetter<Source, Value extends Previous, Previous = Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Previous> | undefined) => Value,
	options?: LinkedStateOptions<Source, Previous>,
	slot?: HookSlot,
): LinkedStateTuple<LinkedStateValue<Value, Previous>>;
export function __useLinkedStateWithGetter<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	options?: LinkedStateOptions<Source, Value> | symbol,
	slot?: HookSlot,
): LinkedStateTuple<Value> {
	if (typeof options === 'symbol') {
		if (slot === undefined) slot = options;
		options = undefined;
	}
	const pair = (useLinkedState as any)(source, reconcile, options, slot) as LinkedStateTuple<Value>;
	const resolved = resolveSlot(slot);
	if (resolved === undefined) missingSlot('useLinkedState');
	const state = CURRENT_SCOPE!.hooks!.get(resolved) as LinkedStateSlot<Source, Value>;
	const block = CURRENT_BLOCK!;
	const getter =
		state.getter ??
		(state.getter = () => {
			if (CURRENT_BLOCK === block && state.renderPending === true) {
				return state.renderValue as Value;
			}
			return latestHookValue(state, null);
		});
	return [pair[0], pair[1], getter];
}

interface ReducerSlot<S, A> extends QueuedCell {
	value: S;
	dispatch: (action: A) => void;
	/** Queued actions are reduced by the reducer of the render that folds them. */
	reducer: (state: S, action: A) => S;
	/** Allocated only for compiler-selected third-tuple consumers. */
	getter: (() => S) | undefined;
}

type ReducerTuple<S, A> = [S, (action: A) => void, () => S];

export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: HookSlot,
): ReducerTuple<S, A>;
export function useReducer<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: HookSlot,
): ReducerTuple<S, A> {
	const s = readReducerHook(reducer, initialArg, initOrSlot, slot);
	return [
		s.queue === null ? s.value : foldHookQueue(s, reducer),
		s.dispatch,
	] as unknown as ReducerTuple<S, A>;
}

function readReducerHook<S, A, I>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot: ((arg: I) => S) | symbol | undefined,
	slot: HookSlot | undefined,
): ReducerSlot<S, A> {
	// The compiler appends the hook slot as the final argument. In Symbol builds,
	// the React 2-arg form `useReducer(reducer, initialState)` arrives as
	// `(reducer, initialState, slot)`; numeric builds reserve the omitted init
	// position and arrive as `(reducer, initialState, undefined, slot)`. The 3-arg form
	// `useReducer(reducer, initialArg, init)` arrives as
	// `(reducer, initialArg, init, slot)`. Disambiguate by which trailing arg
	// is the symbol.
	let init: ((arg: I) => S) | undefined;
	if (typeof initOrSlot === 'symbol') {
		slot = initOrSlot;
	} else {
		init = initOrSlot;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useReducer');
	const scope = CURRENT_SCOPE!;
	const block = CURRENT_BLOCK!;
	let s = scope.hooks?.get(slot) as ReducerSlot<S, A> | undefined;
	if (s === undefined) {
		// React parity: the initial state is `initialArg` used AS-IS. Lazy
		// initialization happens ONLY when the third `init` argument is supplied
		// (`init(initialArg)`). A function passed as `initialArg` in the 2-arg form
		// is stored as the state value verbatim — it is NOT called.
		const initVal = init !== undefined ? init(initialArg) : (initialArg as unknown as S);
		s = {
			value: initVal,
			base: initVal,
			queue: null,
			last: null,
			stamp: 0,
			at: 0,
			reducer,
			// React parity: unlike useState's setter, dispatch does NOT eagerly bail
			// when the reducer returns the same state — a no-op action still renders
			// the component once (children then bail as usual). Per
			// ReactHooksWithNoopRenderer-test.js:3889. The render reduces every
			// queued action with its own reducer, so a reducer that changes alongside
			// state applies to the actions it receives.
			dispatch: (action) => {
				if (block.disposed) return;
				queueHookUpdate(s!, block, transitionActionBatchForUpdate(block), action, 'reducer', slot);
			},
			getter: undefined,
		};
		ensureHooks(scope).set(slot, s);
	} else {
		// Allow reducer reference to update across renders.
		s.reducer = reducer;
	}
	return s;
}

/** Compiler-emitted useReducer variant for a tuple whose third member is observable. */
export function __useReducerWithGetter<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: HookSlot,
): ReducerTuple<S, A>;
export function __useReducerWithGetter<S, A, I = S>(
	reducer: (s: S, a: A) => S,
	initialArg: I,
	initOrSlot?: ((arg: I) => S) | symbol,
	slot?: HookSlot,
): ReducerTuple<S, A> {
	const s = readReducerHook(reducer, initialArg, initOrSlot, slot);
	const getter = (s.getter ??= () => latestHookValue(s, s.reducer));
	return [s.queue === null ? s.value : foldHookQueue(s, reducer), s.dispatch, getter];
}

export function depsChanged(
	prev: any[] | undefined,
	next: any[] | undefined,
	hook = false,
): boolean {
	if (prev === undefined || next === undefined) return true;
	let length = prev.length;
	if (length !== next.length) {
		if (!hook) return true;
		if (process.env.NODE_ENV !== 'production') {
			console.error(
				`The dependency array must keep the same length between renders (previous: ${length}, next: ${next.length}).`,
			);
		}
		length = Math.min(length, next.length);
	}
	for (let i = 0; i < length; i++) {
		if (!Object.is(prev[i], next[i])) return true;
	}
	return false;
}

// True if `block` or any ancestor is in a hidden <Activity> subtree. Effects
// must not run inside such a subtree — neither freshly (enqueueEffect skips
// registration) NOR via an entry already sitting in a phase queue when the
// Activity hides between enqueue and drain (the effect drains skip execution). On
// reveal, deactivateScope has cleared each effect slot's deps, so the
// re-render re-enqueues and the effect finally fires.
export function inInactiveSubtree(block: Block | null): boolean {
	for (let a = block; a !== null; a = a.parentBlock) {
		if (a.inactive) return true;
	}
	return false;
}

// ABI: the compiler appends the hook slot as the LAST argument. Generated code
// normally supplies an inferred or explicit deps array before it. Keep the
// trailing-symbol reinterpret for direct/uncompiled calls and normalize the
// public `null` escape hatch to undefined; internally undefined means "run or
// recompute on every commit/render". Shared by the effect and memo hooks.
export function resolveHookArgs(
	name: string,
	deps: any[] | null | symbol | undefined,
	slot: HookSlot | undefined,
): [any[] | undefined, HookSlot] {
	if (slot === undefined && typeof deps === 'symbol') {
		slot = deps;
		deps = undefined;
	}
	if (deps === null) deps = undefined;
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot(name);
	return [deps as any[] | undefined, slot];
}

export function useEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void;
export function useEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void {
	const [d, s] = resolveHookArgs('useEffect', deps, slot);
	enqueueEffect(s, fn, d, PASSIVE);
}
export function useLayoutEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void;
export function useLayoutEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void {
	const [d, s] = resolveHookArgs('useLayoutEffect', deps, slot);
	enqueueEffect(s, fn, d, LAYOUT);
}

interface LayoutSnapshotBox<T> {
	value: T | undefined;
	effectSlot: symbol;
}

function settleLayoutSnapshot(cell: object, block: Block): void {
	const record = LAYOUT_SNAPSHOT_CHANGES?.get(cell);
	if (record === undefined) return;
	LAYOUT_SNAPSHOT_CHANGES!.delete(cell);
	if (UPDATE_DEPTH_CAUSES?.get(block)?.cell === cell) UPDATE_DEPTH_CAUSES.delete(block);
}

/** Read a value from the committed layout and publish changes before paint. */
export function useLayoutSnapshot<T>(
	measure: () => T,
	options: LayoutSnapshotOptionsWithInitial<T>,
	slot?: HookSlot,
): T;
export function useLayoutSnapshot<T>(
	measure: () => T,
	options?: LayoutSnapshotOptions<T>,
	slot?: HookSlot,
): T | undefined;
export function useLayoutSnapshot<T>(
	measure: () => T,
	options?: LayoutSnapshotOptions<any> | symbol,
	slot?: HookSlot,
): T | undefined {
	// Plain hook transforms append a Symbol where optional options were omitted;
	// production numeric slots have a separate padded argument.
	if (typeof options === 'symbol') {
		if (slot === undefined) slot = options;
		options = undefined;
	}
	// readStateHook resolves the call path once. Without an own slot or an
	// enclosing custom-hook path there is nothing for it to resolve.
	if (slot === undefined && slotStack.length === 0) missingSlot('useLayoutSnapshot');
	const block = CURRENT_BLOCK!;
	const state = readStateHook<LayoutSnapshotBox<T> | undefined>(undefined, slot, false);
	// Boxing preserves function-valued initial values and measurements as data,
	// and lets a custom comparator decide whether even an identical value changes.
	// The box is created on mount, without a per-render initializer closure.
	const box = (state.value ??= {
		value: options?.initial as T | undefined,
		effectSlot: Symbol('layout snapshot effect'),
	});
	enqueueEffect(
		box.effectSlot,
		() => {
			const next = measure();
			const current = state.value!;
			if ((options?.equal ?? Object.is)(current.value, next)) {
				if (process.env.NODE_ENV !== 'production') settleLayoutSnapshot(state, block);
				return;
			}
			if (process.env.NODE_ENV !== 'production') countLayoutSnapshotChange(state, block);
			// This runs inside a layout effect, so the update is urgent and never joins
			// a pending Action: it belongs to the commit being measured.
			state.setter({ value: next, effectSlot: current.effectSlot });
		},
		undefined,
		LAYOUT,
	);
	return box.value;
}

export function useInsertionEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void;
export function useInsertionEffect(fn: EffectFn, deps?: any[] | null, slot?: HookSlot): void {
	const [d, s] = resolveHookArgs('useInsertionEffect', deps, slot);
	enqueueEffect(s, fn, d, INSERTION);
}

export interface MemoHookEntry<T = any> {
	deps: any[] | undefined;
	value: T;
	warmEpisode: number | undefined;
	/** A consumed warm occurrence can return only when this scope is discarded. */
	warmRecord: WarmEntry | undefined;
	/** Defined only on compiler-owned native-read creation caches. */
	nativeWitness: NativeReadWitness | null | undefined;
}

export function memoEntryHit<T>(slot: HookSlot, entry: MemoHookEntry<T>): MemoHookEntry<T> {
	if (
		entry.warmEpisode !== CURRENT_WARM_EPISODE &&
		recordRealWarmMemo(slot, entry.deps as any[], entry)
	) {
		entry.warmEpisode = CURRENT_WARM_EPISODE;
	}
	return entry;
}

export function adoptMemoEntry<T>(
	scope: Scope,
	slot: HookSlot,
	deps: any[],
): MemoHookEntry<T> | null {
	const adopted = adoptWarmEntry(slot, deps);
	if (adopted === WARM_MISS) return null;
	const entry: MemoHookEntry<T> = {
		deps,
		value: adopted.value as T,
		warmEpisode: CURRENT_WARM_EPISODE,
		warmRecord: undefined,
		nativeWitness: undefined,
	};
	setMemoEntry(scope, slot, entry);
	claimWarmMemoRecord(adopted, entry);
	return entry;
}

function readMemoEntry<T>(
	scope: Scope,
	slot: HookSlot,
	deps: any[] | undefined,
): MemoHookEntry<T> | null {
	const prev = scope.hooks?.get(slot) as MemoHookEntry<T> | undefined;
	// deps === undefined → recompute every render (`null` at the public API;
	// direct/uncompiled omitted calls also retain this runtime fallback).
	if (prev && deps !== undefined && !depsChanged(prev.deps, deps, true)) {
		return memoEntryHit(slot, prev);
	}
	// Parallel-use warming: before recomputing, adopt a prefetched creation for
	// this slot (started by warmMemo during a suspended ancestor's warm walk, or
	// by a dropped transition render) — the fetch is already in flight. WARM_EVER
	// keeps the lookup off apps that never warm or drop a transition.
	return WARM_EVER && deps !== undefined ? adoptMemoEntry(scope, slot, deps) : null;
}

export function publishMemoEntry<T>(
	scope: Scope,
	slot: HookSlot,
	deps: any[] | undefined,
	value: T,
	nativeWitness?: NativeReadWitness | null,
): T {
	const entry: MemoHookEntry<T> = {
		deps,
		value,
		warmEpisode: undefined,
		warmRecord: undefined,
		nativeWitness,
	};
	setMemoEntry(scope, slot, entry);
	if (deps !== undefined && recordRealWarmMemo(slot, deps, entry)) {
		entry.warmEpisode = CURRENT_WARM_EPISODE;
	}
	return value;
}

// Development-only factory scope. The compiler retains callback form for
// factories containing use(), so aliases receive the same diagnostic as direct calls.
export let devMemoComputeDepth = 0;

function computeMemoWithDiagnostics<T>(compute: (...deps: any[]) => T, deps: any[] | undefined): T {
	devMemoComputeDepth++;
	try {
		return compute.apply(null, (deps ?? []) as []);
	} finally {
		devMemoComputeDepth--;
	}
}

export function useMemo<T>(compute: (...deps: any[]) => T, deps?: any[] | null, slot?: HookSlot): T;
export function useMemo<T>(
	compute: (...deps: any[]) => T,
	deps?: any[] | null,
	slot?: HookSlot,
): T {
	const [d, s] = resolveHookArgs('useMemo', deps, slot);
	const scope = CURRENT_SCOPE!;
	const entry = readMemoEntry<T>(scope, s, d);
	if (entry !== null) return entry.value;
	// Spread deps as positional args (superset of React — see PendingEffect.args):
	// a factory written as a pure function of its deps is hoistable. Zero-arg
	// React-style factories ignore the extra args.
	// eslint-disable-next-line prefer-spread
	const value =
		process.env.NODE_ENV !== 'production'
			? computeMemoWithDiagnostics(compute, d)
			: compute.apply(null, (d ?? []) as []);
	return publishMemoEntry(scope, s, d, value);
}

export function useCallback<F extends (...args: any[]) => any>(
	fn: F,
	deps?: any[] | null,
	slot?: HookSlot,
): F;
export function useCallback<F extends (...args: any[]) => any>(
	fn: F,
	deps?: any[] | null,
	slot?: HookSlot,
): F {
	// Resolve the raw slot exactly once, including the omitted-deps Symbol ABI
	// and a custom hook's path. The callback is a value: never invoke it or
	// allocate another closure merely to return it on a cache miss.
	const [d, s] = resolveHookArgs('useCallback', deps, slot);
	const scope = CURRENT_SCOPE!;
	const entry = readMemoEntry<F>(scope, s, d);
	return entry === null ? publishMemoEntry(scope, s, d, fn) : entry.value;
}

/** Compiler-owned intrinsics cannot be shadowed by bindings in an authored body. */
export const hookMemoEqual = Object.is;

interface CompilerMemoProof {
	read: (() => unknown[]) | null;
	values: unknown[];
	pass: number;
}
let COMPILER_MEMO_PROOFS: WeakMap<Function, CompilerMemoProof> | null = null;
let unprovenCompilerMemo = 0;

/**
 * Definition-site proof; copying a function's statics cannot transfer it.
 * `read` returns the live imports the body reads and the witnesses of the
 * imported components it renders, so a proof holds only for a proven subtree.
 */
export function markCompilerMemo<T extends Function>(
	component: T,
	read: (() => unknown[]) | null,
): T {
	(COMPILER_MEMO_PROOFS ??= new WeakMap()).set(component, { read, values: [], pass: -1 });
	return component;
}

/**
 * One witness per cached region, outside its component/list work. An unproven
 * component answers a value no earlier call returned, so every region over it,
 * and every proof that reads its witness, misses.
 */
export function compilerMemoWitness(component: any): unknown[] | Function | number {
	if (typeof component !== 'function') return --unprovenCompilerMemo;
	if (component.__memo === true && component.__compare === undefined) return component;
	const proof = COMPILER_MEMO_PROOFS?.get(component);
	if (proof === undefined || 'defaultProps' in component) return --unprovenCompilerMemo;
	const read = proof.read;
	if (read === null) return proof.values;
	if (proof.pass === compilerMemoPass) return proof.values;
	// A proof re-entered mid-read sits on a component cycle across modules, and
	// one whose read threw this pass is incomplete; neither vouches for itself.
	if (proof.pass === ~compilerMemoPass) return --unprovenCompilerMemo;
	proof.pass = ~compilerMemoPass;
	const values = read();
	proof.pass = compilerMemoPass;
	const previous = proof.values;
	if (values.length !== previous.length) return (proof.values = values);
	for (let index = 0; index < values.length; index++) {
		if (!Object.is(values[index], previous[index])) return (proof.values = values);
	}
	// A token already published in a committed region must never be mutated.
	return previous;
}

/** @internal The usual compiled body takes the first-region fast path. */
export function compilerMemoRegion(scope: Scope, bodyId: number): CompilerMemoRegion {
	const first = scope.compilerMemo;
	const region =
		first !== null && first.bodyId === bodyId
			? first
			: createCompilerMemoRegion(scope, bodyId, first);
	// The body may publish a new output cache. A held or rolled-back render
	// restores the cache with the screen it describes, so a retry re-enters what
	// the rollback undid.
	if (TRANSITION_JOURNAL && region.auto !== undefined && !ROOT_RENDER_ROLLBACK) {
		TRANSITION_JOURNAL.push(JOURNAL_PROP, region, 'auto', region.auto);
	}
	return region;
}

// Optimized modules share this ABI with ordinary builds. Only a profiling
// runtime installs the observer, and generated calls use the same define.
if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
	compilerMemoRegion.__profileHit = __profileCacheHit;

function createCompilerMemoRegion(
	scope: Scope,
	bodyId: number,
	first: CompilerMemoRegion | null,
): CompilerMemoRegion {
	if (first === null)
		return (scope.compilerMemo = { bodyId, auto: undefined, hooks: undefined, overflow: null });
	let overflow = first.overflow;
	if (overflow === null) first.overflow = overflow = new Map();
	let region = overflow.get(bodyId);
	if (region === undefined) {
		region = { bodyId, auto: undefined, hooks: undefined, overflow: null };
		overflow.set(bodyId, region);
	}
	return region;
}

export function hookMemoCreate(size: number): any[] {
	// Validity cells test for true; invariant callbacks use a nullish check.
	// A null fill also avoids undefined-double storage becoming holey when the
	// first published value requires object elements in newer V8 versions.
	return new Array(size).fill(null);
}

/** Compiler ABI: publish a successful inline memo computation immediately.
 * Only a transition render, which a hold can drop, keeps the committed cells
 * (transitionMemoCells); ordinary suspend/replay continues to see the
 * just-published cells. Fixed arities keep ordinary cache misses free of a
 * rest-parameter dependency array. */
export function hookMemoPublish0<T>(cells: any[], base: number, value: T): T {
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		TRANSITION_ROOT_DRIVER.memoCells(cells, base, 2);
	cells[base + 1] = value;
	cells[base] = true;
	return value;
}

export function hookMemoPublish1<T>(cells: any[], base: number, value: T, d0: any): T {
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		TRANSITION_ROOT_DRIVER.memoCells(cells, base, 3);
	cells[base + 2] = value;
	cells[base + 1] = d0;
	cells[base] = true;
	return value;
}

export function hookMemoPublish2<T>(cells: any[], base: number, value: T, d0: any, d1: any): T {
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		TRANSITION_ROOT_DRIVER.memoCells(cells, base, 4);
	cells[base + 3] = value;
	cells[base + 1] = d0;
	cells[base + 2] = d1;
	cells[base] = true;
	return value;
}

export function hookMemoPublish3<T>(
	cells: any[],
	base: number,
	value: T,
	d0: any,
	d1: any,
	d2: any,
): T {
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		TRANSITION_ROOT_DRIVER.memoCells(cells, base, 5);
	cells[base + 4] = value;
	cells[base + 1] = d0;
	cells[base + 2] = d1;
	cells[base + 3] = d2;
	cells[base] = true;
	return value;
}

export function hookMemoPublish4<T>(
	cells: any[],
	base: number,
	value: T,
	d0: any,
	d1: any,
	d2: any,
	d3: any,
): T {
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		TRANSITION_ROOT_DRIVER.memoCells(cells, base, 6);
	cells[base + 5] = value;
	cells[base + 1] = d0;
	cells[base + 2] = d1;
	cells[base + 3] = d2;
	cells[base + 4] = d3;
	cells[base] = true;
	return value;
}

/** Larger dependency lists retain the compact variadic publication fallback. */
export function hookMemoPublish<T>(cells: any[], base: number, value: T, ...deps: any[]): T {
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		TRANSITION_ROOT_DRIVER.memoCells(cells, base, deps.length + 2);
	cells[base + deps.length + 1] = value;
	for (let i = 0; i < deps.length; i++) cells[base + i + 1] = deps[i];
	cells[base] = true;
	return value;
}

/** One-cell form for compiler-owned lifetime-invariant callback values. */
export function hookMemoPublishInvariant<T>(cells: any[], base: number, value: T): T {
	if (TRANSITION_ROOT_DRIVER && inTransitionRender())
		TRANSITION_ROOT_DRIVER.memoCells(cells, base, 1);
	cells[base] = value;
	return value;
}

export function useRef<T = undefined>(): { current: T | undefined };
export function useRef<T>(initial: T, slot?: HookSlot): { current: T };
export function useRef<T>(initial?: T, slot?: HookSlot): { current: T | undefined } {
	// Same legacy lone-slot compatibility and authored alias arguments as useState.
	if (
		slot === undefined &&
		typeof initial === 'symbol' &&
		arguments.length === 1 &&
		(slotStack.length === 0 || (MANUAL_HOOK_DRIVER && MANUAL_HOOK_DRIVER.active))
	) {
		slot = initial as unknown as symbol;
		initial = undefined;
	}
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useRef');
	const scope = CURRENT_SCOPE!;
	let s = scope.hooks?.get(slot) as { current: T | undefined } | undefined;
	if (s === undefined) {
		s = { current: initial };
		ensureHooks(scope).set(slot, s);
	}
	return s;
}

export function useLazyRef<T>(factory: () => T, slot?: symbol): { current: T };
export function useLazyRef<T>(factory: () => T, slot?: HookSlot): { current: T } {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useLazyRef');
	const scope = CURRENT_SCOPE!;
	let ref = scope.hooks?.get(slot) as { current: T } | undefined;
	if (ref === undefined) {
		ref = { current: factory() };
		ensureHooks(scope).set(slot, ref);
	}
	return ref;
}

/**
 * React's `useDebugValue(value, format?)` — a devtools-only label for custom
 * hooks. Octane has no devtools inspector, so it is a no-op; exported so custom
 * hooks ported from React run unchanged. Accepts (and ignores) the compiler's
 * trailing compiler slot like every other hook.
 */
export function useDebugValue(_value?: unknown, _format?: unknown, _slot?: HookSlot): void;
export function useDebugValue(_value?: unknown, _format?: unknown, _slot?: HookSlot): void {}

type ImperativeRef<T> =
	| { current: T | null }
	| ((value: T | null) => void)
	| readonly ImperativeRef<T>[]
	| null
	| undefined;

// Array refs are optional work: the ordinary scalar hook below keeps its
// existing attach/cleanup path. Snapshot the attached leaves as cleanups so
// later mutations to the caller's array cannot detach different owners.
function attachImperativeRefArray<T>(refs: readonly ImperativeRef<T>[], factory: () => T): Cleanup {
	const cleanups: Cleanup[] = [];
	let value: T;
	let initialized = false;
	function attach(ref: ImperativeRef<T>): void {
		if (ref == null) return;
		if (Array.isArray(ref)) {
			for (let i = 0; i < ref.length; i++) attach(ref[i]);
			return;
		}
		if (!initialized) {
			value = factory();
			initialized = true;
		}
		if (typeof ref === 'function') {
			const cleanup: unknown = ref(value);
			cleanups.push(typeof cleanup === 'function' ? (cleanup as Cleanup) : () => ref(null));
		} else {
			const objectRef = ref as { current: T | null };
			objectRef.current = value;
			cleanups.push(() => {
				objectRef.current = null;
			});
		}
	}
	function detach(): void {
		let error: unknown;
		let failed = false;
		for (const cleanup of cleanups) {
			try {
				cleanup();
			} catch (caught) {
				if (!failed) {
					error = caught;
					failed = true;
				}
			}
		}
		cleanups.length = 0;
		if (failed) throw error;
	}
	try {
		attach(refs);
	} catch (error) {
		// A failed attachment never installs an effect cleanup. Release the
		// successful earlier leaves here, preserving the original failure.
		try {
			detach();
		} finally {
			throw error;
		}
	}
	return detach;
}

/**
 * React's `useImperativeHandle(ref, factory, deps)` — exposes an imperative
 * API to a parent via the ref. Scheduled as a layout-phase effect so the
 * `ref.current` is populated before paint and before any layout effects in
 * ancestors that depend on the API. Cleared to null on unmount. Octane's
 * nested array refs share one factory result across all non-null owners.
 */
export function useImperativeHandle<T>(
	ref: ImperativeRef<T>,
	factory: () => T,
	deps?: any[] | null,
	slot?: HookSlot,
): void;
export function useImperativeHandle<T>(
	ref: ImperativeRef<T>,
	factory: () => T,
	deps?: any[] | null,
	slot?: HookSlot,
): void {
	const [resolvedDeps, resolvedSlot] = resolveHookArgs('useImperativeHandle', deps, slot);
	deps = resolvedDeps;
	slot = resolvedSlot;
	// Re-run when the deps OR the ref IDENTITY changes. React manages ref attachment
	// independently of deps — a swapped ref must detach the old (cleanup → setRef(null) on
	// the PREVIOUS ref) and populate the new one, even when deps are stable (e.g. `[]`).
	// Appending `ref` makes a ref change a dep change, so the prior run's cleanup (closed
	// over the old ref) fires before the new run sets the new ref. No-deps (`undefined` →
	// run every render) already re-attaches each render, so it's left as-is.
	const effectDeps = deps === undefined ? undefined : [...deps, ref];
	enqueueEffect(
		slot,
		() => {
			if (Array.isArray(ref)) return attachImperativeRefArray(ref, factory);
			// React-19 callback-ref cleanup (refs-test.js:528): a callback ref may
			// RETURN a cleanup; detach then runs the cleanup INSTEAD of ref(null).
			// Handled locally (not via attachRef) because the handle value can be a
			// primitive, which attachRef's per-target WeakMap can't key.
			let cleanup: unknown;
			if (typeof ref === 'function') cleanup = (ref as any)(factory());
			else if (ref != null) (ref as { current: T | null }).current = factory();
			return () => {
				if (typeof cleanup === 'function') {
					cleanup();
					return;
				}
				if (typeof ref === 'function') (ref as any)(null);
				else if (ref != null) (ref as { current: T | null }).current = null;
			};
		},
		effectDeps,
		LAYOUT,
	);
}

// Per-call-site cache of the two derived sub-slot symbols a uSES call needs (the
// inst cell + the subscribe effect). Computing `Symbol.for(desc + …)` and hitting
// the global Symbol registry on EVERY render was pure overhead; the resolved slot
// is stable per call site (resolveSlot interns custom-hook call PATHS), so one
// lookup per site amortizes to nothing. Grows monotonically, bounded by resolved
// call paths — strictly fewer entries than the four registry symbols the old code
// re-derived every render.
const USES_SUBSLOTS = new Map<HookSlot, { inst: symbol; effect: symbol }>();
export function usesSubslots(slot: HookSlot): { inst: symbol; effect: symbol } {
	let s = USES_SUBSLOTS.get(slot);
	if (s === undefined) {
		const desc = appendSlotKey('@octane:uses:', slot);
		s = { inst: Symbol.for(desc + ':uses:inst'), effect: Symbol.for(desc + ':uses:effect') };
		USES_SUBSLOTS.set(slot, s);
	}
	return s;
}

// Push (or refresh) a consumer's pending commit-sync onto the store-sync queue.
// GATED by the caller (mount, or a snapshot/subscribe change) so an unchanged
// render enqueues nothing. The `queued` flag collapses a double push when a block
// renders twice before its single commit — the later render's snapshot wins.
// Off-screen renders redirect into WIP_CAPTURE.stores (spliced back only if the
// WIP commits), exactly like enqueueEffect.
export function enqueueStoreSync(
	inst: StoreInst<any>,
	value: any,
	subscribe: (cb: () => void) => () => void,
): void {
	inst.pending = value;
	inst.subscribe = subscribe;
	if (inst.queued) return;
	inst.queued = true;
	(WIP_CAPTURE !== null ? WIP_CAPTURE.stores : storeSyncQueue).push(inst);
}

// Passive-phase subscription body for uSES, written as a DEPS-AS-ARGS function
// (the effect drains apply the deps array positionally — a Ripple superset, see
// PendingEffect.args) so it lives at module scope with zero per-render capture.
// The PARAMETER ORDER MUST MATCH the deps array `[inst, subscribe]` at the call
// site — reordering the deps silently mis-binds these arguments. Re-fires only
// when inst (stable) or subscribe changes: on a store swap the effect slot's
// cleanup unsubscribes the old store first, then this re-subscribes to the new.
export function subscribeToStore(
	inst: StoreInst<any>,
	subscribe: (cb: () => void) => () => void,
): Cleanup {
	// The store may have mutated between the render read and this subscription
	// taking effect; re-check immediately so an early notify isn't missed. Uses
	// inst.getSnapshot, which render already advanced to the latest closure.
	if (checkStoreChanged(inst)) inst.forceUpdate();
	// One stable handler across re-subscribes (inst.onStoreChange never changes) —
	// harmless here since stores key listeners by our Set membership, and the
	// swap-cleanup removes the old registration before we add the new one.
	return subscribe(inst.onStoreChange);
}

export function useId(slot?: HookSlot): string;
export function useId(slot?: HookSlot): string {
	slot = resolveSlot(slot);
	if (slot === undefined) missingSlot('useId');
	const scope = CURRENT_SCOPE!;
	let s = scope.hooks?.get(slot) as { id: string } | undefined;
	if (s === undefined) {
		const ids = scope.block.idState;
		let owner = ids;
		while (owner.limit !== undefined && owner.next >= owner.limit && owner.overflow !== undefined) {
			owner = owner.overflow;
		}
		s = { id: formatUseId(owner.prefix, owner.next++) };
		ensureHooks(scope).set(slot, s);
	}
	return s.id;
}
