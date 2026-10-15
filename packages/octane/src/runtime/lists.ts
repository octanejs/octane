// Keyed lists
//
// `@for` and keyed lists with LIS reconciliation, fast host lists and keyed
// selection.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './activity.js';
import { hydrating } from '../hydration-flag.js';
import { EPOCH_CELL } from '../context-epoch.js';
import { __profileCount, ProfileCounter } from '../profiling.js';
import { selfDelimits } from '../hydration-protocol.js';
import { moveNativeNodeBefore } from '../dom-focused-move.js';
import type {
	ComponentBody,
	Scope,
	Block,
	SlotNext,
	ElementDescriptor,
	ChildSlot,
} from './types.js';
import { trackSignalRetryListKeys, renderBlock } from './signal-owners.js';
import {
	ROOT_RENDER_ROLLBACK,
	journalRootProperty,
	retireBlocks,
	placeRun,
	isCreatedInRootRender,
	renderingFocus,
	captureFocusedMovement,
} from './engine.js';
import { isSuspenseException, retainDiscardedWarmMemos } from './use.js';
import { SKIPPED_ROW_REFRESH, isHostContextRequest } from './context.js';
import { CURSOR, isRendererHydrationStyle, auditHydrationProbe, isBlockOpen } from './hydration.js';
import {
	createBlock,
	RETURNED_OUTPUT_SCOPE,
	setReturnedOutputOwner,
	unmountBlock,
	registerSlot,
	clearItems,
} from './block.js';
import {
	discardSignalRetryItem,
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_BAGS,
	TRANSITION_JOURNAL_CHECKPOINT,
	ROOT_RENDER_TRANSACTION,
	preserveRootCreatedDom,
	mountFastHostItems,
	renderLiteListItem,
} from './render.js';
import { isAdoptionControl } from './hydration-presentation.js';
import { isHostElementOfType } from './host-props.js';
import { isElementDescriptor, isHostDescriptor } from './elements.js';
import { restampCachedContextScope, refreshBlockForContext } from './component-slots.js';
import { mapSlot } from './child-slots.js';
import {
	frontierSentinel,
	releaseFrontierSentinel,
	freshSlotEnd,
	settleFreshSlot,
	removeAfter,
} from './branches.js';
import { descNeedsBlocks } from './deopt.js';
import {
	JOURNAL_INPUTS,
	queueFrontier,
	placeAtCommit,
	markerPending,
	markerPosition,
	markerParent,
	discardMarker,
	atCommit,
	queueRootUnmount,
	listNext,
	DETACHED_ROOT,
	newDetachedRoot,
	placeRoots,
	listRun,
	type ForSlotRecord,
	journalForSlot,
	forSlotLinks,
	journalForListClear,
	type FocusSelectionSnapshot,
	type FocusSelectionBatch,
} from './commit.js';
import { getNextSibling } from './templates.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// ---------------------------------------------------------------------------
// Control flow: forBlock with LIS-based keyed reconciliation
// ---------------------------------------------------------------------------

export interface ForSlot {
	__kind: 'forBlockSlot';
	// Inline row owners need a call-site namespace without consuming the list
	// keys that independently compiled child components still inherit.
	signalSite: string | undefined;
	start: Comment;
	end: Comment;
	items: Map<any, Block>; // key → item Block (O(1) survivor lookup)
	// Whether `items` iterates in chain order: true for an empty Map and after an
	// in-order fill, append or removal; a reorder or a middle insert clears it.
	// Only while it holds can a rollback that deleted keys rebuild the Map from
	// the restored chain (journalForSlot).
	inOrder: boolean;
	head: Block | null; // first item Block in DOM order
	tail: Block | null; // last item Block in DOM order
	size: number; // count of item Blocks
	// Last-render snapshot of the body's closed-over parent locals. The compiler
	// emits a fresh `deps` array on every parent render for DEP-PURE for-of
	// calls (hookless host bodies, optionally with proven host-only conditional
	// content). When this render's deps match last render's element-by-element,
	// the runtime treats the body as PURE for the survivor short-circuit — saving
	// the entire body call for every item whose ref + position are unchanged.
	cachedDeps: any[] | null;
	// Context epoch at which every row was last rendered or refreshed. A pure
	// skip bypasses its rows' renders, so refreshSkippedRows compares this
	// before revisiting them.
	ctxEpoch: number;
	// `@for (...) { ... } @empty { ... }` support: mounted-empty-branch Block,
	// or null when there are items (or no `@empty` branch was compiled). The
	// empty body is hoisted by the compiler as its own helper and passed to
	// forBlock as the trailing `emptyBody` arg; we mount it on the transition
	// `items.length > 0 → 0` and unmount on `0 → >0`.
	emptyBlock: Block | null;
	// Hoisted-helper env tuple (compiled-output Phase 2): the `deps` array
	// doubles as the item/empty helpers' captured-locals tuple — refreshed by
	// forBlock every parent render and stamped as `block.extra` on every item
	// block (mount + survivor re-render) and on the @empty block.
	env: any[] | undefined;
	// One-shot adoption queue for the pure-host → blocks upgrade (see childSlot's
	// upgrade branch): the adopted element's existing raw child nodes in DOM
	// order, each pre-keyed like the incoming items, so reconcileKeyed's
	// empty→fill mount wraps them in item ranges IN PLACE (node identity,
	// focus, input state survive — React parity) instead of rebuilding.
	// Consumed and nulled within the same render.
	adopt: Array<{ key: any; node: Node }> | null;
	// Set only on a childSlot owned by the compiler's guarded map ABI.
	// Keeps descriptor↔compiled adoption off every ordinary descriptor list.
	// Undefined means the arm has not been selected; false is a selected fallback.
	mappedNative: boolean | undefined;
	// Set exactly when this de-opt list's items render through the plain
	// `deoptItemBody` (no compiled map body, no mapped fallback wrapper), to that
	// list's survivor update, updateDeoptComponent; null on every other list.
	// `mountItem` and `updateSurvivor` need the fact but must NOT name
	// `deoptItemBody` to get it: a live reference there comes from the compiled
	// `@for` path that every application reaches, and it makes the entire
	// descriptor renderer (childSlot, fragment refs, portals, transitions, the
	// attribute tables) reachable from apps that only ever render compiled
	// templates. Recorded on the slot instead, so the reference stays inside
	// childSlot, which already retains that graph. Both ForSlot literals declare
	// it so every slot shares one hidden class.
	plainDeopt: ((block: Block, item: any, index: number) => boolean) | null;
	// Set only when the compiler proved a keyed equality selection. Identity
	// gates the two-row update without retaining extra state on ordinary lists.
	selectionItems: ArrayLike<any> | undefined;
	/**
	 * The open root render's pending structure (listNext): its `out` is the
	 * rows' DOM work in render order, which the commit replays.
	 */
	next: SlotNext | null;
}

export function forBlock<T>(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	inputItems: ArrayLike<T> | Iterable<T>,
	getKey: (item: T, index: number) => any,
	itemBody: (item: T, scope: Scope) => void,
	flags?: number,
	deps?: any[],
	emptyBody?: ComponentBody | null,
	anchor?: Node | null,
	// The compiler created `anchor` as this call site's dedicated `<!>`
	// placeholder. Reuse it as the durable closing boundary instead of keeping
	// both that placeholder and a newly-created `/for` comment.
	ownEnd?: boolean,
	signalSite?: string,
): void {
	// The iterable expression can queue a self-update before this call starts.
	// Do not mount or remove items from an output the owner will replay.
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	// SSR snapshots arbitrary iterable inputs before rendering any rows. Do the
	// same before mutating the client slot: a throwing iterator must not leave a
	// partly accepted list. Arrays keep their identity and allocate nothing here.
	const items: ArrayLike<T> = Array.isArray(inputItems) ? inputItems : Array.from(inputItems);
	// flags bitfield: bit 0 = pure (auto-memo), bit 1 = singleRoot (skip per-item
	// Comment markers), bit 2 = depEligible (compare `deps` to cachedDeps and
	// promote body to PURE when unchanged), bit 3 = indexIndependent (the body
	// binds no `index` name → a pure reorder that only moves a survivor's
	// position need not re-render it), bit 4 = the server emitted direct-host
	// items without per-item pairs, bit 5 = a nested host conditional requires
	// its owning Block's scope whenever an item body does need to render, bit 7 =
	// a sole component row whose template inserts its one root, bits 8+ = a keyed
	// selection's dependency index. Packed into one numeric literal.
	const parentBlock = parentScope.block;
	const hydration = hydrating ? CURSOR : null;
	let state = parentScope.slots[slotKey] as ForSlot | undefined;
	if (
		state === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		parentBlock.createdStamp !== ROOT_RENDER_TRANSACTION.createdStamp
	) {
		const fresh = freshSlotEnd(parentBlock, domParent, anchor);
		if (fresh !== null) {
			try {
				forBlock(
					parentScope,
					slotKey,
					fresh.parentNode!,
					items,
					getKey,
					itemBody,
					flags,
					deps,
					emptyBody,
					fresh,
					false,
					signalSite,
				);
			} finally {
				settleFreshSlot(parentScope, fresh, anchor);
			}
			return;
		}
	}
	if (state === undefined) {
		let start: Comment;
		let end: Comment;
		const open = hydration?.resolveOpen(anchor ?? null, domParent) ?? null;
		if (open !== null) {
			// Hydration: the server wrapped the whole @for in a `<!--[f…-->…<!--]-->`
			// range, at the anchor or, for a sole @for of its body, at the cursor.
			// Adopt it as the slot's markers and point the cursor at the first
			// item so that the empty→fill mount below adopts each item (mountItem).
			start = open;
			end = hydration!.close(open);
			hydration!.node = getNextSibling(start);
		} else {
			// The server frames every list, so a hydrating list without its range
			// finds what the server rendered for something else.
			if (hydration !== null)
				hydration.failAt(parentScope, slotKey, 'a list range', anchor ?? hydration.node);
			start = document.createComment('for');
			// insertBefore(_, null) === appendChild — covers both end-of-parent and
			// mid-range insertion (when a static sibling follows this @for in mixed
			// children, the compiler emits a `<!>` anchor at the @for's source-order
			// index and threads it here so the markers land BEFORE the sibling).
			if (ownEnd === true && anchor?.nodeType === 8) {
				end = anchor as Comment;
				end.data = '/for';
				domParent.insertBefore(start, end);
			} else {
				end = document.createComment('/for');
				domParent.insertBefore(start, anchor ?? null);
				domParent.insertBefore(end, anchor ?? null);
			}
		}
		state = {
			__kind: 'forBlockSlot',
			start,
			end,
			items: new Map(),
			inOrder: true,
			head: null,
			tail: null,
			size: 0,
			cachedDeps: null,
			ctxEpoch: 0,
			emptyBlock: null,
			env: undefined,
			adopt: null,
			// Stays null on a compiled `@for` slot, but both ForSlot literals
			// declare it so every slot shares one hidden class and the stamp in
			// childSlot transitions nothing.
			plainDeopt: null,
			mappedNative: undefined,
			selectionItems: undefined,
			signalSite,
			next: null,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	// A pending child can replay its adopted slot with the cursor back on the
	// outer open marker. First-fill adoption always starts inside that range,
	// including a zero-item list that already has a retained slot, or one that
	// kept no items after a fill threw.
	if (hydration !== null && state.size === 0) hydration.node = getNextSibling(state.start);
	// The list's open says which arm the server rendered: items or @empty
	// (hydration-protocol.ts). A plain range is not a list's.
	const serverMarkerState = hydration?.markerState(state.start) ?? -1;
	if (serverMarkerState === -1 && hydration !== null)
		hydration.failAt(parentScope, slotKey, 'a list range', state.start);
	// The env tuple refreshes every parent render (the compiled call site
	// re-evaluates the captured values); item/empty blocks pick it up at
	// mount and at every survivor re-render below.
	if (ROOT_RENDER_TRANSACTION !== null && state.env !== deps)
		journalRootProperty(state, 'env', state.env);
	state.env = deps;
	// Where the list's commit entry goes if this render changes its structure.
	const at = ROOT_RENDER_TRANSACTION === null ? 0 : ROOT_RENDER_TRANSACTION.ops.length;
	// `@empty` arm: when `items.length === 0` and the compiler emitted an
	// empty-body helper, mount that body in place of the (empty) item list. We
	// also tear down any previously-mounted items so transitioning items → 0 →
	// items behaves identically to a regular un-mount/re-mount cycle.
	const isEmpty = items.length === 0;
	if (isEmpty && emptyBody) {
		if (state.size > 0) {
			// had items last render, now we're empty — tear down the chain.
			reconcileKeyed(parentBlock, state, items, getKey, itemBody as any, false, false);
		}
		if (state.emptyBlock) {
			// keep the existing empty branch mounted, but re-render in case the
			// body closes over parent state that changed this render.
			if (state.emptyBlock.body !== emptyBody)
				journalRootProperty(state.emptyBlock, 'body', state.emptyBlock.body);
			if (state.emptyBlock.extra !== state.env)
				journalRootProperty(state.emptyBlock, 'extra', state.emptyBlock.extra);
			state.emptyBlock.body = emptyBody;
			state.emptyBlock.extra = state.env;
			renderBlock(state.emptyBlock);
		} else {
			if (TRANSITION_JOURNAL !== null) journalForSlot(state);
			if (hydration !== null) {
				// The server rendered a populated list where the client renders @empty:
				// the content inside the @for range is item blocks (`<!--[-->`), not the
				// @empty body.
				if (serverMarkerState === 1)
					hydration.failAt(
						parentScope,
						slotKey,
						'an empty list (@empty)',
						getNextSibling(state.start),
					);
				// The server already rendered the @empty content directly inside the
				// adopted outer range. The empty body borrows that range and adopts from
				// its first child; no redundant inner pair is necessary.
				hydration.node = getNextSibling(state.start);
			}
			const next = listNext(state, parentBlock, at);
			// A committed list's @empty renders off-document, in a run of its own
			// before the list's end, and takes the list's markers as it lands.
			let frag: DocumentFragment | null = null;
			let sentinel: Comment | null = null;
			if (next !== null) {
				frag = document.createDocumentFragment();
				(frag as any).$$next = next;
				next.members ??= [];
				next.out.push(placeRun, frag, state.end);
				sentinel = frontierSentinel(frag, '/for');
			}
			const b = createBlock(
				'control-flow',
				parentBlock,
				frag ?? domParent,
				frag === null ? state.start : null,
				sentinel ?? state.end,
				emptyBody,
				undefined,
				state.env,
			);
			// The outer ForSlot owns these comments. Empty-body teardown clears only
			// their contents so the slot remains a stable insertion boundary for the
			// next empty → items transition.
			b.exclusiveMarkers = true;
			// The ForSlot owns rollback of this borrowed range. Discarding the
			// fresh empty scope must not also detach retained committed rows.
			preserveRootCreatedDom(b);
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileCount(ProfileCounter.FOR_EMPTY_MOUNT);
			state.emptyBlock = b;
			renderBlock(b);
			if (sentinel !== null) {
				// Its root slots insert where its content lands; its bound is the list's.
				releaseFrontierSentinel(b, frag!, sentinel, state.end);
				b.startMarker = state.start;
				b.endMarker = state.end;
			}
		}
		// Advance the cursor past the whole @for so the next sibling's clone()
		// doesn't read a position left inside this consumed range.
		hydration?.parkPast(state.end, parentScope);
		return;
	}
	// We have items (or no empty body). If an empty branch was previously
	// mounted, tear it down before reconciling so its DOM doesn't sit alongside
	// the freshly-mounted items.
	if (state.emptyBlock) {
		// A committed list deletes the branch at commit, like a row; one this
		// render built leaves its run now.
		const empty = state.emptyBlock;
		if (TRANSITION_JOURNAL !== null) journalForSlot(state);
		const next = listNext(state, parentBlock, at);
		if (next === null) unmountBlock(empty);
		else if (!isCreatedInRootRender(next.tx, empty)) queueRootUnmount(empty, true, next.out);
		else {
			const run = empty.parentNode;
			unmountBlock(empty, false);
			if (run.nodeType === 11) removeAfter(run as DocumentFragment, null, null);
		}
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.FOR_EMPTY_UNMOUNT);
		state.emptyBlock = null;
	}
	// Hydrating, the server rendered no items (its open marker says so) where the
	// client has items.
	if (!isEmpty && hydration !== null && serverMarkerState === 0) {
		hydration.failAt(parentScope, slotKey, 'a populated list', getNextSibling(state.start));
	}
	const f = flags || 0;
	let pure = (f & 1) !== 0;
	// DEP-PURE upgrade: when the compiler marked this for-block as deps-eligible
	// and last render's snapshot matches this render's, we can treat the body
	// as PURE for the survivor short-circuit. The body still runs for moved/
	// mounted/removed items — only stable survivors get skipped.
	// `lite` = an unstructured depEligible body did NOT promote to pure this
	// render. Such a body has no hooks, nested components, or control flow, so
	// it cannot observe CURRENT_SCOPE / CURRENT_BLOCK and can run directly.
	// Host-only nested conditionals may also qualify for the survivor skip, but
	// need their owning Block's scope when a dependency actually changes.
	// In particular, transition rollback must snapshot each row's own bag.
	let lite = false;
	if ((f & 4) !== 0 && deps !== undefined) {
		const requiresScope = (f & 32) !== 0;
		if (requiresScope && TRANSITION_JOURNAL !== null && ROOT_RENDER_TRANSACTION === null) {
			// The list journal restores membership and DOM, not this dependency
			// snapshot. A suspended attempt must never leave a rolled-back list
			// believing that its uncommitted dependencies are still current.
			state.cachedDeps = null;
			pure = false;
		} else {
			if (state.cachedDeps !== null && depsEqual(state.cachedDeps, deps)) {
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileCount(ProfileCounter.FOR_SKIP);
				pure = true;
			} else {
				lite = !requiresScope;
			}
			if (ROOT_RENDER_TRANSACTION !== null && state.cachedDeps !== deps)
				journalRootProperty(state, 'cachedDeps', state.cachedDeps);
			state.cachedDeps = deps;
		}
	}
	// A committed list's direct-host row (true) or sole-component row (2) keeps
	// its root detached until commit (mountItem).
	const markerless = (f & 16) !== 0 || ((f & 128) !== 0 && 2);
	if (state.size === 0) {
		// First fill (hydration adopt / fresh mount / update-path 0 → N): the
		// linear pass — the full reconciler has no old list to diff against.
		mountItemsLinear(parentBlock, state, items, getKey, itemBody as any, (f & 2) !== 0, markerless);
		// Only first-fill adoption consumes unowned server items. Survivor
		// reconciliation can leave the cursor inside an already-owned item, which
		// is no server item left over when a pending child replays hydration.
		if (hydration !== null) hydration.settle(state.end, parentScope, slotKey);
	} else {
		reconcileKeyed(
			parentBlock,
			state,
			items,
			getKey,
			itemBody as any,
			pure,
			(f & 2) !== 0,
			lite,
			(f & 8) !== 0,
			markerless,
		);
		if (pure && SKIPPED_ROW_REFRESH) SKIPPED_ROW_REFRESH(state, parentBlock);
	}
	// Advance the hydration cursor past the @for's `<!--]-->` so a later sibling's
	// clone() starts after this block — covers the zero-item, no-@empty case where
	// reconcileKeyed mounts nothing and the cursor would otherwise stay on the
	// inner close marker.
	hydration?.parkPast(state.end, parentScope);
}

// A pure row skip bypasses the row's render, and with it the context work its
// slots would do: a value hole can still mount a consumer, as an armed
// childSlot that records its reads. So, as a memo bail does, a skipped row
// refreshes after a Provider commit when it is stamped at an older epoch, and
// under memo ancestry restores its reads onto the ancestors whose render
// cleared them. A pure body is hookless, so a row with no child scope or slot
// reads no context.
export function refreshSkippedRows(list: ForSlot, owner: Block): void {
	const epoch = EPOCH_CELL.value;
	const refresh = list.ctxEpoch !== epoch;
	if (!refresh && !owner.memoInChain) return;
	for (let item: Block | null = list.head; item !== null; item = item.nextSibling) {
		if (item._slots === null && item.children === null) continue;
		if (refresh && item.$$ctxDepsEpoch !== epoch) refreshBlockForContext(item);
		if (owner.memoInChain) restampCachedContextScope(item);
	}
	list.ctxEpoch = epoch;
}

/**
 * Compiler-only keyed-selection entry. Keeping the specialization outside
 * forBlock lets applications without a proven selection tree-shake its cost.
 * This entry point identifies the proof; bits 6+ hold its dependency index.
 */
export function keyedForBlock<T>(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	items: ArrayLike<T>,
	getKey: (item: T, index: number) => any,
	itemBody: (item: T, scope: Scope) => void,
	flags: number,
	deps: any[],
	emptyBody?: ComponentBody | null,
	anchor?: Node | null,
	ownEnd?: boolean,
	selectionBody?: ComponentBody<T, any[]>,
	signalSite?: string,
): void {
	// forBlock may skip discarded output before it creates the list slot.
	// Skip selection bookkeeping with the same owner check.
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	const state = parentScope.slots[slotKey] as ForSlot | undefined;
	if (TRANSITION_JOURNAL !== null && ROOT_RENDER_TRANSACTION === null) {
		if (state !== undefined) {
			// A transition can commit or roll back without journaling this cache.
			// Invalidate both snapshots so its next ordinary render re-primes them.
			state.cachedDeps = null;
			state.selectionItems = undefined;
		}
		// DEP-PURE's direct body call leaves CURRENT_SCOPE on the parent. Force
		// full row rendering so reversible DOM writes journal each row's own bag.
		flags &= ~4;
	} else if (
		state !== undefined &&
		(!hydrating || CURSOR === null) &&
		state.cachedDeps !== null &&
		tryUpdateKeyedSelection(
			state,
			items,
			itemBody,
			state.cachedDeps,
			deps,
			flags >>> 8,
			selectionBody,
		)
	) {
		if (SKIPPED_ROW_REFRESH) SKIPPED_ROW_REFRESH(state, parentScope.block);
		return;
	}

	forBlock(
		parentScope,
		slotKey,
		domParent,
		items,
		getKey,
		itemBody,
		flags,
		deps,
		emptyBody,
		anchor,
		ownEnd,
		signalSite,
	);
	if (TRANSITION_JOURNAL === null || ROOT_RENDER_TRANSACTION !== null) {
		const rendered = parentScope.slots[slotKey] as ForSlot;
		if (rendered.selectionItems !== items)
			journalRootProperty(rendered, 'selectionItems', rendered.selectionItems);
		rendered.selectionItems = items;
	}
}

// Keep the certified host-only mounting path off common small lists.
const FAST_HOST_LIST_MIN_ITEMS = 16;

/** Select an existing, empty compiler-certified list for direct host mounting. */
function fastHostListParent(
	state: ForSlot | null | undefined,
	items: ArrayLike<any>,
	flags: number | undefined,
): Node | null {
	if (
		state === undefined ||
		state === null ||
		state.size !== 0 ||
		state.emptyBlock !== null ||
		state.adopt !== null ||
		((flags || 0) & 2) === 0 ||
		!Array.isArray(items) ||
		items.length < FAST_HOST_LIST_MIN_ITEMS ||
		(hydrating && CURSOR !== null) ||
		state.end.parentNode === null ||
		state.start.parentNode !== state.end.parentNode
	) {
		return null;
	}
	return state.end.parentNode;
}

/** Compiler-only direct host-row entry; ordinary list bundles do not retain it. */
export function fastForBlock<T>(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	items: ArrayLike<T>,
	getKey: (item: T, index: number) => any,
	itemBody: (item: T, scope: Scope) => void,
	flags?: number,
	deps?: any[],
	emptyBody?: ComponentBody | null,
	anchor?: Node | null,
	ownEnd?: boolean,
): void {
	const state = parentScope.slots[slotKey] as ForSlot | undefined;
	const parent = fastHostListParent(state, items, flags);
	if (parent === null) {
		forBlock(
			parentScope,
			slotKey,
			domParent,
			items,
			getKey,
			itemBody,
			flags,
			deps,
			emptyBody,
			anchor,
			ownEnd,
		);
		return;
	}
	mountFastHostItems(parentScope, state!, parent, items, getKey, itemBody, flags, deps, false);
}

/** Direct host-row mounts composed with the independent keyed-selection proof. */
export function fastKeyedForBlock<T>(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	items: ArrayLike<T>,
	getKey: (item: T, index: number) => any,
	itemBody: (item: T, scope: Scope) => void,
	flags: number,
	deps: any[],
	emptyBody?: ComponentBody | null,
	anchor?: Node | null,
	ownEnd?: boolean,
	selectionBody?: ComponentBody<T, any[]>,
): void {
	const state = parentScope.slots[slotKey] as ForSlot | undefined;
	const parent = fastHostListParent(state, items, flags);
	if (parent === null) {
		keyedForBlock(
			parentScope,
			slotKey,
			domParent,
			items,
			getKey,
			itemBody,
			flags,
			deps,
			emptyBody,
			anchor,
			ownEnd,
			selectionBody,
		);
		return;
	}
	mountFastHostItems(parentScope, state!, parent, items, getKey, itemBody, flags, deps, false);
	if (state!.selectionItems !== items)
		journalRootProperty(state!, 'selectionItems', state!.selectionItems);
	state!.selectionItems = items;
}

/** Direct host-row mounts for compiler-proven, guarded native JSX map rows. */
export function fastMapSlot(
	scopeOrItems: any,
	slotOrMethod: any,
	domParent?: Node,
	items?: any,
	method?: any,
	native?: boolean | ((...args: any[]) => any),
	callback?: (...args: any[]) => any,
	getKey?: (item: any, index: number) => any,
	itemBody?: (item: any, scope: Scope) => void,
	flags?: number,
	deps?: any[],
	anchor?: Node | null,
	ownEnd?: boolean | 1,
): boolean | void {
	if (arguments.length === 2) return mapSlot(scopeOrItems, slotOrMethod);
	// Compact map calls carry the callback in place of the native answer. Mirror
	// mapSlot's normalization so custom receivers execute exactly one guard and
	// retain their complete observable map callback/species/getter behavior.
	if (typeof native === 'function') {
		ownEnd = anchor as boolean | 1 | undefined;
		anchor = deps as Node | null | undefined;
		deps = flags as any[] | undefined;
		flags = itemBody as unknown as number | undefined;
		itemBody = getKey as unknown as (item: any, scope: Scope) => void;
		getKey = callback as (item: any, index: number) => any;
		callback = native;
		native = mapSlot(items, method) as boolean;
	}
	const slot = (scopeOrItems as Scope).slots[slotOrMethod] as ChildSlot | undefined;
	const state = slot?.forSlot;
	const parent = native === true ? fastHostListParent(state, items, flags) : null;
	if (parent === null) {
		return mapSlot(
			scopeOrItems,
			slotOrMethod,
			domParent,
			items,
			method,
			native,
			callback,
			getKey,
			itemBody,
			flags,
			deps,
			anchor,
			ownEnd,
		);
	}
	if (
		slotOrMethod === 0 &&
		scopeOrItems !== RETURNED_OUTPUT_SCOPE &&
		(slot as any).returnedOutput === true
	) {
		setReturnedOutputOwner(slot, false);
	}
	mountFastHostItems(
		scopeOrItems as Scope,
		state!,
		parent,
		items,
		getKey!,
		itemBody!,
		flags,
		deps,
		true,
	);
}

/**
 * Remove every sibling from `from` (inclusive) up to but NOT including `end`.
 * The shared hydration "discard the stale server range" sweep: used when the
 * server-rendered content inside an adopted `<!--[-->…<!--]-->` range doesn't
 * match what the client renders (content vs empty branch in @if/@switch, items
 * vs @empty in @for, leftover server items past the client's last item).
 * `end` may be null (an @if slot whose end marker isn't minted yet) — then the
 * sweep runs to the last sibling, exactly as the open-coded loops did.
 */
export function removeRange(from: Node | null, end: Node | null): void {
	let n: Node | null = from;
	while (n !== null && n !== end) {
		const next: Node | null = getNextSibling(n);
		(n as ChildNode).remove();
		n = next;
	}
}

// Deps-snapshot compare for the @for DEP-PURE promotion. Object.is per element — the
// same equality the hook-side `depsChanged` uses — so a NaN dep doesn't permanently
// defeat the pure promotion (`NaN !== NaN` would fail every render) and ±0 behave
// identically on both paths.
export function depsEqual(a: any[], b: any[]): boolean {
	const n = a.length;
	if (n !== b.length) return false;
	for (let i = 0; i < n; i++) {
		if (!Object.is(a[i], b[i])) return false;
	}
	return true;
}

/**
 * A compiler-proven equality against the list key changes at most two rows.
 * The immutable source identity and every other captured dependency must stay
 * unchanged; anything else falls back to the ordinary keyed reconciliation.
 */
function tryUpdateKeyedSelection<T>(
	state: ForSlot,
	items: ArrayLike<T>,
	itemBody: (item: T, scope: Scope) => void,
	previousDeps: any[],
	deps: any[],
	selectionIndex: number,
	selectionBody: ComponentBody<T, any[]> | undefined,
): boolean {
	if (
		state.selectionItems !== items ||
		state.size !== items.length ||
		state.items.size !== state.size ||
		previousDeps.length !== deps.length ||
		selectionIndex >= deps.length
	) {
		return false;
	}
	for (let i = 0; i < deps.length; i++) {
		if (i !== selectionIndex && !Object.is(previousDeps[i], deps[i])) return false;
	}
	const previous = previousDeps[selectionIndex];
	const next = deps[selectionIndex];
	// Publish the same snapshots as forBlock before any row can run user code;
	// reentrant updates must observe the selection currently being committed.
	if (ROOT_RENDER_TRANSACTION !== null && state.cachedDeps !== deps)
		journalRootProperty(state, 'cachedDeps', state.cachedDeps);
	if (ROOT_RENDER_TRANSACTION !== null && state.env !== deps)
		journalRootProperty(state, 'env', state.env);
	state.cachedDeps = deps;
	state.env = deps;
	if (Object.is(previous, next)) return true;

	let first = state.items.get(previous) as Block | undefined;
	let second = state.items.get(next) as Block | undefined;
	if (first === second) second = undefined;
	if (first !== undefined && second !== undefined && first.itemIndex > second.itemIndex) {
		const swap = first;
		first = second;
		second = swap;
	}
	if (first !== undefined) {
		if (first.body !== itemBody) journalRootProperty(first, 'body', first.body);
		if (first.extra !== deps) journalRootProperty(first, 'extra', first.extra);
		first.body = itemBody as ComponentBody;
		first.extra = deps;
		// A separately certified host row can update just its class binding. Raw
		// object/function children register child slots, however, and must still
		// reconcile on the ordinary body path even when their identity is stable.
		// Primitive-only child holes retain no slots, so they pay no extra cache.
		if (selectionBody !== undefined && first._slots === null) {
			renderLiteListItem(first, selectionBody, deps);
		} else {
			renderLiteListItem(first, itemBody as ComponentBody, deps);
		}
	}
	if (second !== undefined) {
		if (second.body !== itemBody) journalRootProperty(second, 'body', second.body);
		if (second.extra !== deps) journalRootProperty(second, 'extra', second.extra);
		second.body = itemBody as ComponentBody;
		second.extra = deps;
		if (selectionBody !== undefined && second._slots === null) {
			renderLiteListItem(second, selectionBody, deps);
		} else {
			renderLiteListItem(second, itemBody as ComponentBody, deps);
		}
	}
	return true;
}

// Cutoff for the small-displacement shortcut in reconcileKeyed. When fewer
// than this many positions change between renders (and every item survives),
// we compute the move set directly in O(K_DISP) instead of paying the LIS
// path's O(N) alloc + back-walk. Covers single drag-and-drop, undo/redo of a
// recent edit, animated swap transitions, A/B variant toggles, etc. Above
// this threshold the LIS path wins. The module-level buffer is safely reused
// across calls: reconcileKeyed CAN re-enter (a nested @for inside an item body
// re-enters via renderBlock), but never between _disp's fill and consume — no
// user code runs in that window — so the buffer is never clobbered while live.
const K_DISP = 4;
const _disp = new Int32Array(K_DISP);

// Keep at most one numeric source buffer and one LIS predecessor buffer. Source
// buffers stay live across user rendering, so taking one removes it from the
// cache until reconciliation finishes; nested lists must receive their own.
// Oversized lists use disposable buffers instead of retaining their backing
// stores. The two capped caches can retain at most 128 KiB between renders.
const MAX_KEYED_REORDER_SCRATCH = 16_384;
let keyedReorderSources: Int32Array | null = null;
let keyedLisPredecessors: Int32Array | null = null;

/**
 * Keyed reconciliation over a doubly-linked list of item Blocks.
 *
 * Item Blocks form a sibling chain via `prevSibling` / `nextSibling`; the
 * ForSlot tracks `head` / `tail` / `size`. Removing or inserting an item is
 * O(1) pointer updates — no array splice, no `order` array to rebuild. The
 * Map (`state.items`) is kept only for O(1) survivor lookup by key during the
 * middle-section diff.
 *
 * Algorithm shape matches Ripple/Solid/Vue: prefix walk, suffix walk, then
 * a middle section that either is pure-insert / pure-remove, or runs the
 * full survivor-partition + LIS-based move pass. The linked list shows up in
 * the prefix/suffix walks (cursor advance via .nextSibling / .prevSibling)
 * and in the splice step that reattaches the new middle to the surrounding
 * chain.
 */
// Update ONE surviving keyed block for the new render pass — shared by all three
// survivor walks in reconcileKeyed (prefix, suffix, middle). Top-level (not a
// closure) so reconcileKeyed's hot path allocates nothing for it.
//   - Pure-body memo: when the compiler statically proved the for-of body closes
//     over nothing from parent scope, body output is a pure function of
//     (item, itemIndex). Identical refs → skip renderBlock entirely (only
//     the body ref is refreshed).
//   - `lite` = depEligible body (no hooks, no comps, no control flow): skip
//     renderBlock's activeBlock plumbing and call the body directly.
function updateSurvivor<T>(
	block: Block,
	newItem: T,
	newIdx: number,
	itemBody: (item: T, scope: Scope) => void,
	pure: boolean,
	lite: boolean,
	indexIndependent: boolean,
	// Hoisted-helper env tuple (compiled-output Phase 2) — this render's
	// captured values; stamped/passed so the body's `__extra` destructure
	// reads current values (a per-render closure saw the same).
	env: any[] | undefined,
): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.LIST_UPDATE);
	// Pure short-circuit: skip the body when the item ref is unchanged AND either
	// the body can't observe position (indexIndependent — the common index-less
	// `@for`) or the position is also unchanged. This is what makes a pure reorder
	// (shuffle / reverse / rotate) move survivors' DOM without re-rendering them.
	// The list's shape record restores itemIndex from chain order; reconcileKeyed
	// takes it before the first survivor index write.
	const journal = ROOT_RENDER_TRANSACTION !== null && !ROOT_RENDER_ROLLBACK;
	if (journal && block.body !== itemBody) journalRootProperty(block, 'body', block.body);
	if (pure && block.props === newItem && (indexIndependent || block.itemIndex === newIdx)) {
		block.itemIndex = newIdx;
		block.body = itemBody as ComponentBody;
	} else if (
		// A plain de-opt list can update a same-component item without its render.
		!block.forSlot!.plainDeopt?.(block, newItem, newIdx)
	) {
		// Item and captured inputs change together before the body can run. One
		// entry restores both without a second property key or journal guard.
		if (journal && (block.props !== newItem || block.extra !== env))
			TRANSITION_JOURNAL!.push(JOURNAL_INPUTS, block, block.props, block.extra);
		block.props = newItem;
		block.body = itemBody as ComponentBody;
		block.itemIndex = newIdx;
		block.extra = env;
		if (lite) {
			// Lite survivors bypass renderBlock — pass the tuple directly as the
			// body's third arg (the same slot renderBlock forwards block.extra to).
			renderLiteListItem(block, itemBody as ComponentBody, env);
		} else {
			renderBlock(block);
		}
	}
}

export type ListKeySource<T> = readonly any[] | ((item: T, index: number) => any);

// Prepared descriptor keys already have their reconciliation encoding. Compiled
// maps normalize each callback result at the original read site; ordinary @for
// callbacks retain their raw key identity and receive exactly two arguments.
// The source stays local to this call so nested item renders cannot replace it.
export function readListKey<T>(
	keySource: ListKeySource<T>,
	item: T,
	index: number,
	normalizeKey: boolean,
): any {
	if (typeof keySource !== 'function') return keySource[index];
	return normalizeKey ? 'k' + String(keySource(item, index)) : keySource(item, index);
}

/**
 * Linear first-fill of an EMPTY keyed list — the hydration-adopt / first-mount
 * path: append (or adopt) each item in order and build the survivor machinery
 * (key map + intrusive sibling chain) as a byproduct of the same pass. Kept as
 * its own small function, OUTSIDE reconcileKeyed, so a first mount — every
 * hydration adopt of a server-rendered @for, and every fresh list mount — never
 * enters (and on a cold page, never lazily compiles) the full prefix/suffix/LIS
 * reconciler. reconcileKeyed delegates here too, so its empty→fill contract is
 * unchanged for update-path 0 → N transitions.
 */
// Validate keys as the existing reconciler reads them. Never invoke a key
// expression twice for diagnostics; repeated reads of the same index are legal.
function checkedListKey<T>(
	keySource: ListKeySource<T>,
	normalizeKey: boolean,
): (item: T, index: number) => any {
	const seen = new Map<any, number>();
	let warned = false;
	return (item, index) => {
		const key = readListKey(keySource, item, index, normalizeKey);
		if (!warned && seen.has(key) && seen.get(key) !== index) {
			warned = true;
			const label =
				typeof key === 'object' || typeof key === 'function' ? '[object identity]' : String(key);
			console.error(
				`Encountered two children with the same key, ${label}. Keys should be unique so that components maintain their identity across updates.`,
			);
		} else seen.set(key, index);
		return key;
	};
}

export function mountItemsLinear<T>(
	parentBlock: Block,
	state: ForSlot,
	items: ArrayLike<T>,
	keySource: ListKeySource<T>,
	itemBody: (item: T, scope: Scope) => void,
	singleRoot: boolean | 2,
	ssrMarkerless: boolean | 2,
	normalizeKey: boolean = false,
	passthroughList: boolean = false,
	// A host's upgrade (renderPreparedChildList): its rows render where they
	// stand or off-document, and placeUpgradedList orders them at commit.
	upgradeHost: Node | null = null,
	// The caller owns this index. An accepted queue position i becomes -i - 1:
	// its node cannot be adopted twice, and the original queue survives a retry.
	adoptByKey: Map<any, number> | null = null,
): any[] | null {
	const newLen = items.length;
	const observeKey =
		parentBlock.idState.renderOwner?.signalOwner !== undefined
			? trackSignalRetryListKeys(parentBlock, state, newLen, keySource)
			: undefined;
	if (newLen === 0) return null;
	if (process.env.NODE_ENV !== 'production') {
		keySource = checkedListKey(keySource, normalizeKey);
		normalizeKey = false;
	}
	// Every 0 -> N fill funnels through here (forBlock, the value-position array
	// path, and reconcileKeyed's own empty branch). An empty list is still a
	// shape to go back to: a fill during a render that may yet hold must come
	// back out — rows, scopes and queued effects together — or the held boundary
	// shows fresh rows with their bindings half rolled back underneath them.
	if (TRANSITION_JOURNAL !== null) journalForSlot(state);
	const oldItems = state.items;
	// A hydrating list's end may still be to place (placeAtCommit).
	const parentNode = upgradeHost ?? markerParent(state.end)!;
	// A committed list's rows render off-document and land before its end.
	const next =
		ROOT_RENDER_TRANSACTION === null || passthroughList
			? null
			: listNext(state, parentBlock, ROOT_RENDER_TRANSACTION.ops.length);
	const adopt = state.adopt;
	// A staged upgrade's new rows, off-document, and its adopted rows whose pair
	// wraps their node at commit.
	let run: DocumentFragment | null = null;
	let wraps: any[] | null = null;
	let prev: Block | null = null;
	try {
		for (let i = 0; i < newLen; i++) {
			const item = items[i];
			const key = readListKey(keySource, item, i, normalizeKey);
			if (observeKey !== undefined) observeKey(i, key);
			let adoptNode: Node | null = null;
			let anchor: Node | null = state.end;
			let into = parentNode;
			if (adoptByKey !== null) {
				const candidate = adoptByKey.get(key);
				anchor = null;
				if (candidate !== undefined && candidate >= 0) {
					adoptNode = adopt![candidate].node;
					adoptByKey.set(key, -candidate - 1);
				} else into = run ??= queueFrontier(parentBlock, parentNode, null);
			}
			const block: Block =
				hydrating && passthroughList
					? mountPassthroughListItem(
							parentBlock,
							parentNode,
							anchor!,
							item,
							i,
							key,
							itemBody,
							state,
						)
					: mountItem(
							parentBlock,
							into,
							anchor,
							item,
							i,
							key,
							itemBody,
							state,
							singleRoot,
							ssrMarkerless,
							adoptNode,
							false,
							next,
						);
			if (adoptNode !== null && block.startMarker !== adoptNode)
				(wraps ??= []).push(block, adoptNode);
			oldItems.set(key, block);
			block.prevSibling = prev;
			block.nextSibling = null;
			if (prev) prev.nextSibling = block;
			else state.head = block;
			prev = block;
		}
		state.tail = prev;
		state.size = newLen;
	} catch (error) {
		// Adopted nodes still belong to the committed raw host tree and the cleanup
		// below deliberately leaves them connected. Keep the full queue so the root
		// rollback/retry can adopt the same prefix instead of mounting duplicates.
		// A list item may suspend while mounting (most visibly a lazy
		// component). None of this empty->fill pass has committed yet: discard
		// every completed prefix item, while mountItem discards the throwing
		// item itself. A retry then starts from a genuinely empty list instead
		// of duplicating the completed prefix and overwriting its Map entry.
		while (prev !== null) {
			const block = prev;
			prev = block.prevSibling;
			oldItems.delete(block.key);
			const start = passthroughList ? block.startMarker : null;
			const end = passthroughList ? block.endMarker : null;
			const discardOwnedDom =
				passthroughList &&
				!isSuspenseException(error) &&
				!isHostContextRequest(error) &&
				!isAdoptionControl(error);
			if (isSuspenseException(error)) retainDiscardedWarmMemos(block);
			// A hydrating item adopted server DOM, which a failed attempt leaves.
			if (block.idState.renderOwner?.signalOwner !== undefined)
				discardSignalRetryItem(block, error);
			else unmountBlock(block, !hydrating && !ROOT_RENDER_TRANSACTION?.retainedCreated?.has(block));
			if (start !== null && end !== null)
				removePassthroughItemRange(parentNode, start, end, discardOwnedDom);
		}
		state.head = null;
		state.tail = null;
		state.size = 0;
		throw error;
	}
	return wraps;
}

// A list above a selected hydration owner has no server list frames in the
// selected container. Give each logical sibling its own client range while
// leaving the server cursor for the owner inside one of those siblings.
function mountPassthroughListItem<T>(
	parentBlock: Block,
	parentNode: Node,
	anchor: Node,
	item: T,
	index: number,
	key: unknown,
	body: (item: T, scope: Scope) => void,
	forSlot: ForSlot,
): Block {
	const hydration = CURSOR!;
	// The list's own end may still be to place (placeAtCommit): a cursor that
	// reached where it lands stands at it.
	const end$ = markerPosition(anchor);
	const cursor = hydration.node;
	const before =
		cursor !== null && cursor.parentNode === parentNode && cursor !== end$ ? cursor : anchor;
	const start = document.createComment('it');
	const end = document.createComment('/it');
	// The item's range lands in the server DOM at commit: its end, provisionally
	// at the list's end, moves past what the item adopted once it rendered.
	placeAtCommit(parentNode, start, before);
	placeAtCommit(parentNode, end, anchor);
	const block = createBlock(
		'control-flow',
		parentBlock,
		parentNode,
		start,
		end,
		body as ComponentBody,
		item,
		forSlot.env,
	);
	block.forSlot = forSlot;
	block.key = key;
	block.itemIndex = index;
	preserveRootCreatedDom(block);
	const fresh = cursor === null || cursor === anchor || cursor === end$;
	const previousPassthrough = hydration.passthroughRanges;
	hydration.passthroughRanges = true;
	if (process.env.NODE_ENV !== 'production') auditHydrationProbe('passthrough', false);
	try {
		if (fresh) hydration.suspend(() => renderBlock(block));
		else renderBlock(block);
	} catch (error) {
		if (isSuspenseException(error)) retainDiscardedWarmMemos(block);
		const discardOwnedDom =
			previousPassthrough &&
			!hydration.passthroughRanges &&
			!isSuspenseException(error) &&
			!isHostContextRequest(error) &&
			!isAdoptionControl(error);
		unmountBlock(block, false);
		removePassthroughItemRange(parentNode, start, end, discardOwnedDom);
		throw error;
	} finally {
		hydration.passthroughRanges = previousPassthrough && hydration.passthroughRanges;
	}
	const next = hydration.node;
	const after = next !== null && next.parentNode === parentNode && next !== end$ ? next : anchor;
	placeAtCommit(parentNode, end, after);
	// The owner can advance the cursor to this item's provisional end. The
	// following logical sibling must start after that end, not inside the item.
	hydration.node = markerPosition(after);
	return block;
}

/**
 * Take a passthrough item's range out. A hydrating render places it at commit,
 * so it cancels that, and the server content the item owned (`discard`), from
 * where the range starts to where it ends, leaves at commit.
 */
function removePassthroughItemRange(parent: Node, start: Node, end: Node, discard: boolean): void {
	const from = markerPosition(start);
	const to = markerPending(end) ? markerPosition(end) : getNextSibling(end);
	discardMarker(start);
	discardMarker(end);
	if (discard) atCommit(removeOwnedContent, [parent, from, to]);
}

/** Remove `parent`'s nodes from `from` up to `to`, but a renderer style. */
function removeOwnedContent([parent, from, to]: [Node, Node | null, Node | null]): void {
	for (let node = from; node !== null && node !== to;) {
		const next = getNextSibling(node);
		if (node.parentNode === parent && !isRendererHydrationStyle(node)) (node as ChildNode).remove();
		node = next;
	}
}

export function reconcileKeyed<T>(
	parentBlock: Block,
	state: ForSlot,
	items: ArrayLike<T>,
	keySource: ListKeySource<T>,
	itemBody: (item: T, scope: Scope) => void,
	pure: boolean,
	// true / false = compiler-static (compiled @for); 2 = de-opt per-item
	// self-marking sentinel, resolved by mountItem against each item VALUE.
	singleRoot: boolean | 2,
	lite: boolean = false,
	indexIndependent: boolean = false,
	// The matching server compiler proved a direct host root and omitted the
	// item's hydration pair. Kept separate from singleRoot because sole-component
	// and conditional roots are markerless only on fresh client mounts today; 2 =
	// a sole-component row, markerless on the client only (mountItem).
	ssrMarkerless: boolean | 2 = false,
	normalizeKey: boolean = false,
): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.LIST_RECONCILE);
	const oldItems = state.items;
	const oldSize = state.size;
	const newLen = items.length;
	const parentNode = state.end.parentNode!;
	// Where this reconcile's commit entry goes if it changes the list's structure
	// (listNext), and that entry's pending structure once it does.
	const at = ROOT_RENDER_TRANSACTION === null ? 0 : ROOT_RENDER_TRANSACTION.ops.length;
	let next: SlotNext | null | undefined;
	// Scalar survivor updates journal their own bindings. Capture the chain and
	// key map only if reconciliation actually changes membership or order, so
	// unchanged lists do not allocate a second O(N) representation every render.
	// A survivor's index moves only with that order, so the first index write
	// takes the capture too, which restores every row's index on rollback.
	// Index writes and the bounded relinks (inserts, removals, a small
	// displacement) take the link form and record the rows they relink; a
	// wholesale relink takes the full form (journalForSlot).
	let journalShape = TRANSITION_JOURNAL !== null;
	let record: ForSlotRecord | null = null;

	// Fast path: empty → fill — the linear first-fill pass (callers on the
	// first-mount path dispatch to it directly and skip this function entirely).
	if (oldSize === 0) {
		mountItemsLinear(
			parentBlock,
			state,
			items,
			keySource,
			itemBody,
			singleRoot,
			ssrMarkerless,
			normalizeKey,
		);
		return;
	}
	const observeKey =
		parentBlock.idState.renderOwner?.signalOwner !== undefined
			? trackSignalRetryListKeys(parentBlock, state, newLen, keySource)
			: undefined;
	if (process.env.NODE_ENV !== 'production') {
		keySource = checkedListKey(keySource, normalizeKey);
		normalizeKey = false;
	}
	// Fast path: clear all.
	if (newLen === 0) {
		next = listNext(state, parentBlock, at);
		// A committed list's rows change nothing before its commit clears them.
		if (
			next !== null &&
			(TRANSITION_JOURNAL_BAGS!.get(state) ?? -1) < TRANSITION_JOURNAL_CHECKPOINT
		)
			journalForListClear(state);
		else if (journalShape) journalForSlot(state);
		// The undo holds the old key map; clear only the one the list now has.
		batchClearItems(state, state.items, next);
		state.head = null;
		state.tail = null;
		state.size = 0;
		state.inOrder = true;
		return;
	}

	// ── Prefix walk: advance head cursor while keys match new[i] at position i.
	let oldFirst: Block | null = state.head;
	let prefixLen = 0;
	while (oldFirst !== null && prefixLen < newLen) {
		const newItem = items[prefixLen];
		const newKey = readListKey(keySource, newItem, prefixLen, normalizeKey);
		if (oldFirst.key !== newKey) break;
		if (observeKey !== undefined) observeKey(prefixLen, newKey);
		const block = oldFirst;
		// Stable-survivor skip: updateSurvivor writes itemIndex/body only when
		// they differ, journals only on a difference, and renders only when the
		// item (or index, for an index-reading body) changed. A pure body whose
		// item ref, body, and position all match is a provable no-op call — on a
		// mostly-stable list that is one call per row per update. Skip it; the
		// key read above already ran, so dev-mode duplicate-key checks are
		// unchanged. The env tuple is never consumed by the pure branch, and a
		// non-pure body still enters updateSurvivor for its renderBlock.
		if (
			!pure ||
			block.props !== newItem ||
			block.body !== itemBody ||
			block.itemIndex !== prefixLen
		) {
			if (journalShape && block.itemIndex !== prefixLen) {
				record = journalForSlot(state, true);
				journalShape = false;
			}
			updateSurvivor(block, newItem, prefixLen, itemBody, pure, lite, indexIndependent, state.env);
		}
		oldFirst = block.nextSibling!;
		prefixLen++;
	}

	// Both lists fully consumed by prefix? Identical → done.
	if (prefixLen === newLen && oldFirst === null) return;

	// ── Suffix walk: retreat tail cursor while keys match new[newEnd].
	let oldLast: Block | null = state.tail;
	let newEnd = newLen - 1;
	let oldRemain = oldSize - prefixLen;
	while (oldLast !== null && oldRemain > 0 && newEnd >= prefixLen) {
		const newItem = items[newEnd];
		const newKey = readListKey(keySource, newItem, newEnd, normalizeKey);
		if (oldLast.key !== newKey) break;
		if (observeKey !== undefined) observeKey(newEnd, newKey);
		const block = oldLast;
		// Same stable-survivor skip as the prefix walk (see above).
		if (!pure || block.props !== newItem || block.body !== itemBody || block.itemIndex !== newEnd) {
			if (journalShape && block.itemIndex !== newEnd) {
				record = journalForSlot(state, true);
				journalShape = false;
			}
			// Mirror updateSurvivor's pure branch when its body is also unchanged.
			// Keep profiling and index bookkeeping aligned with that branch.
			if (pure && indexIndependent && block.props === newItem && block.body === itemBody) {
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileCount(ProfileCounter.LIST_UPDATE);
				block.itemIndex = newEnd;
			} else {
				updateSurvivor(block, newItem, newEnd, itemBody, pure, lite, indexIndependent, state.env);
			}
		}
		oldLast = block.prevSibling!;
		newEnd--;
		oldRemain--;
	}

	// Boundaries of the OLD middle in the linked list.
	//   beforeMiddle = last prefix-matched block (or null if prefix empty)
	//   afterMiddle  = first suffix-matched block (or null if suffix empty)
	// When oldRemain === 0, the OLD middle is empty — oldFirst is either null
	// (prefix consumed all of old) or it points at the first suffix-matched block.
	let beforeMiddle: Block | null;
	let afterMiddle: Block | null;
	if (oldRemain === 0) {
		afterMiddle = oldFirst;
		beforeMiddle = afterMiddle ? afterMiddle.prevSibling! : state.tail;
	} else {
		beforeMiddle = oldFirst!.prevSibling!;
		afterMiddle = oldLast!.nextSibling!;
	}

	// Case: old middle empty, new middle non-empty → only inserts.
	if (oldRemain === 0) {
		if (journalShape) record = journalForSlot(state, true);
		// Only `beforeMiddle` gets a new nextSibling; new keys append to the Map,
		// which a middle insert leaves out of chain order.
		const links = forSlotLinks(record);
		if (links !== null && beforeMiddle !== null && !links.has(beforeMiddle))
			links.set(beforeMiddle, beforeMiddle.nextSibling);
		if (afterMiddle !== null) state.inOrder = false;
		const anchor: Node = afterMiddle ? afterMiddle.startMarker! : state.end;
		// Fresh rows render off-document and land before the anchor at commit.
		next = listNext(state, parentBlock, at);
		let prev: Block | null = beforeMiddle;
		for (let i = prefixLen; i <= newEnd; i++) {
			const item = items[i];
			const key = readListKey(keySource, item, i, normalizeKey);
			if (observeKey !== undefined) observeKey(i, key);
			const block = mountItem(
				parentBlock,
				parentNode,
				anchor,
				item,
				i,
				key,
				itemBody,
				state,
				singleRoot,
				ssrMarkerless,
				null,
				true,
				next,
			);
			oldItems.set(key, block);
			block.prevSibling = prev;
			block.nextSibling = afterMiddle;
			if (prev) prev.nextSibling = block;
			else state.head = block;
			prev = block;
		}
		if (afterMiddle) afterMiddle.prevSibling = prev;
		else state.tail = prev;
		state.size += newEnd - prefixLen + 1;
		return;
	}

	// Case: new middle empty, old middle non-empty → only removes.
	if (prefixLen > newEnd) {
		if (journalShape) record = journalForSlot(state, true);
		// The removed run keeps its own links; only `beforeMiddle` gets a new
		// nextSibling. Deleted keys go back to their Map positions by chain order,
		// or by the Map's order kept here when that differs.
		const links = forSlotLinks(record);
		if (links !== null) {
			if (!record!.inOrder) record!.prior ??= [...oldItems.values()];
			if (beforeMiddle !== null && !links.has(beforeMiddle))
				links.set(beforeMiddle, beforeMiddle.nextSibling);
		}
		next = listNext(state, parentBlock, at);
		let cur: Block | null = oldFirst;
		let removed = 0;
		while (cur !== afterMiddle) {
			const following: Block | null = cur!.nextSibling!;
			// A committed list deletes the row at commit, after its cleanups.
			if (next !== null) queueRootUnmount(cur!, false, next.out);
			else unmountBlock(cur!);
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileCount(ProfileCounter.LIST_REMOVE);
			oldItems.delete(cur!.key);
			cur = following;
			removed++;
		}
		if (beforeMiddle) beforeMiddle.nextSibling = afterMiddle;
		else state.head = afterMiddle;
		if (afterMiddle) afterMiddle.prevSibling = beforeMiddle;
		else state.tail = beforeMiddle;
		state.size -= removed;
		return;
	}

	// ── General case: both middles non-empty. Partition + LIS-move.
	const newMidLen = newEnd - prefixLen + 1;
	const newKeys: any[] = [];
	const newKeysToIdx = new Map<any, number>(); // key → MIDDLE-RELATIVE index (0..newMidLen-1)
	// Equal-length middles can match unchanged positions directly. Keep only
	// the other keys in the lookup map; local swaps then avoid indexing every
	// untouched row between the moved ones. NaN retains Map's equality semantics.
	// A fresh first key commonly starts a full replacement, where the extra
	// chain walk earns nothing. Select the strategy from the first middle key,
	// without keeping another value live across the prefix/suffix fast paths.
	let keyCursor = oldRemain === newMidLen ? oldFirst : null;
	let hasStableKeys = false;
	for (let i = 0; i < newMidLen; i++) {
		const key = readListKey(keySource, items[prefixLen + i], prefixLen + i, normalizeKey);
		newKeys[i] = key;
		if (i === 0 && keyCursor !== null && !oldItems.has(key)) keyCursor = null;
		if (keyCursor !== null) {
			if (keyCursor.key === key) hasStableKeys = true;
			else newKeysToIdx.set(key, i);
			keyCursor = keyCursor.nextSibling;
		} else newKeysToIdx.set(key, i);
		if (observeKey !== undefined) observeKey(prefixLen + i, key);
	}

	// Full-replace fast path — when prefix/suffix are empty AND no old items
	// survive, batch-clear with `textContent = ''` (one DOM op vs N removeChild)
	// and mass-mount. Detect "no survivors" by checking just the first old block
	// (the loop in the original code exits after one hit too).
	if (
		!hasStableKeys &&
		beforeMiddle === null &&
		afterMiddle === null &&
		!newKeysToIdx.has(oldFirst!.key)
	) {
		// Quick scan: confirm no survivor before committing to batch-clear.
		let anySurvivors = false;
		let cur: Block | null = oldFirst!.nextSibling!;
		while (cur !== null) {
			if (newKeysToIdx.has(cur.key)) {
				anySurvivors = true;
				break;
			}
			cur = cur.nextSibling!;
		}
		if (!anySurvivors) {
			if (journalShape || record !== null) journalForSlot(state);
			next = listNext(state, parentBlock, at);
			batchClearItems(state, oldItems, next);
			state.inOrder = true;
			state.head = null;
			state.tail = null;
			state.size = 0;
			let prev: Block | null = null;
			for (let i = 0; i < newLen; i++) {
				const item = items[i];
				const key = newKeys[i]; // prefixLen === 0, so newKeys spans the full list
				const block = mountItem(
					parentBlock,
					parentNode,
					state.end,
					item,
					i,
					key,
					itemBody,
					state,
					singleRoot,
					ssrMarkerless,
					null,
					true,
					next,
				);
				oldItems.set(key, block);
				block.prevSibling = prev;
				block.nextSibling = null;
				if (prev) prev.nextSibling = block;
				else state.head = block;
				prev = block;
			}
			state.tail = prev;
			state.size = newLen;
			return;
		}
	}

	// sources[i] = old middle-relative index for new[prefixLen + i], or -1 if new.
	const cachedSources = keyedReorderSources;
	let sources: Int32Array;
	if (cachedSources !== null && cachedSources.length >= newMidLen) {
		keyedReorderSources = null;
		sources = cachedSources;
	} else {
		sources = new Int32Array(newMidLen);
	}
	try {
		for (let i = 0; i < newMidLen; i++) sources[i] = -1;

		let moved = false;
		let lastIdx = 0;
		let patched = 0;

		// Walk old middle (linked-list traversal): re-render survivors, unmount removed.
		let cur: Block | null = oldFirst;
		let oldIdx = 0;
		while (cur !== afterMiddle) {
			const following: Block | null = cur!.nextSibling!;
			const newRelIdx =
				hasStableKeys && newKeys[oldIdx] === cur!.key ? oldIdx : newKeysToIdx.get(cur!.key);
			if (newRelIdx === undefined) {
				if (journalShape || record !== null) {
					journalForSlot(state);
					journalShape = false;
					record = null;
				}
				if (next === undefined) next = listNext(state, parentBlock, at);
				if (next !== null) queueRootUnmount(cur!, false, next.out);
				else unmountBlock(cur!);
				if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
					__profileCount(ProfileCounter.LIST_REMOVE);
				oldItems.delete(cur!.key);
				state.size--;
			} else {
				sources[newRelIdx] = oldIdx;
				if (newRelIdx < lastIdx) moved = true;
				else lastIdx = newRelIdx;
				patched++;
				const newIdx = prefixLen + newRelIdx;
				const newItem = items[newIdx];
				// Same stable-survivor skip as the prefix walk (see above).
				if (
					!pure ||
					cur!.props !== newItem ||
					cur!.body !== itemBody ||
					cur!.itemIndex !== newIdx
				) {
					if (journalShape && cur!.itemIndex !== newIdx) {
						record = journalForSlot(state, true);
						journalShape = false;
					}
					updateSurvivor(cur!, newItem, newIdx, itemBody, pure, lite, indexIndependent, state.env);
				}
			}
			cur = following;
			oldIdx++;
		}

		// Fast bail: all survivors AND no moves AND no mounts → old middle is the
		// same shape & order as new middle.
		if (!moved && patched === newMidLen) {
			// If the survivor walk did NOT unmount anything (oldRemain ===
			// patched), the linked-list pointers are still correct end-to-end
			// and we can return without touching them. But if blocks were
			// unmounted BETWEEN survivors, the survivors' .prevSibling /
			// .nextSibling pointers still reference now-disposed blocks AND
			// state.head / state.tail may also point at disposed blocks. The
			// next reconcile would then walk those stale pointers, decrement
			// state.size for blocks that no longer exist, and ultimately
			// crash with a null-pointer access in the prefix/suffix walk.
			//
			// Relink the entire middle chain so its prev/next pointers — and
			// the boundary into beforeMiddle / afterMiddle / state.head /
			// state.tail — accurately reflect the post-unmount topology.
			// O(newMidLen); only fires when survivors and removes are mixed.
			// Surfaced by fuzz-keyed-list seed=-2060211668 action 9 (a
			// replace-all 13 → 2 where both survivors are in original order).
			if (oldRemain !== patched) {
				let prev: Block | null = beforeMiddle;
				for (let i = 0; i < newMidLen; i++) {
					const block = oldItems.get(newKeys[i])!;
					block.prevSibling = prev;
					if (prev) prev.nextSibling = block;
					else state.head = block;
					prev = block;
				}
				prev!.nextSibling = afterMiddle;
				if (afterMiddle) afterMiddle.prevSibling = prev;
				else state.tail = prev;
			}
			return;
		}

		// The remaining middle needs a move or an insertion. Pure survivor
		// updates above may have completed first, but have not changed the chain.
		state.inOrder = false;

		// ── Small-displacement shortcut. When every old item survived AND only a
		// small number of positions actually changed (≤ K_DISP), we can compute
		// the exact move set in O(K_DISP) instead of paying the LIS path's O(N)
		// allocation + back-walk that rewrites every prev/next pointer. This is
		// a general property of permutations — when survivors are stable and the
		// permutation has few fixed-point misses, LIS does provably wasted work.
		//
		// Real shapes this covers:
		//   - drag-and-drop reorder (swap two rows, rotate three)
		//   - undo/redo of a recent local edit
		//   - animated swap / sort transitions
		//   - A/B variant toggle that flips a small set of cells
		//   - any benchmark or test fixture that mutates exactly K positions
		//
		// Bail cost on a true large-shuffle permutation: K_DISP + 1 source
		// compares before falling through to the LIS path, which is sub-µs.
		if (moved && patched === newMidLen) {
			let dCount = 0;
			for (let i = 0; i < newMidLen; i++) {
				if (sources[i] !== i) {
					if (dCount === K_DISP) {
						dCount = K_DISP + 1;
						break;
					}
					_disp[dCount++] = i;
				}
			}
			if (dCount <= K_DISP) {
				if (journalShape) record = journalForSlot(state, true);
				// Before the first write, record each row whose nextSibling this
				// shortcut rewrites: every displaced row and the row it lands after,
				// the new middle's last row, and `beforeMiddle`.
				const links = forSlotLinks(record);
				if (links !== null) {
					const touched: (Block | null)[] = [beforeMiddle, oldItems.get(newKeys[newMidLen - 1])!];
					for (let j = 0; j < dCount; j++) {
						const i = _disp[j];
						touched.push(oldItems.get(newKeys[i])!, i > 0 ? oldItems.get(newKeys[i - 1])! : null);
					}
					for (const b of touched) if (b !== null && !links.has(b)) links.set(b, b.nextSibling);
				}
				const endAnchor: Node = afterMiddle ? afterMiddle.startMarker! : state.end;
				if (next === undefined) next = listNext(state, parentBlock, at);
				// Move right-to-left. Positions to the right of the rightmost
				// displaced index are identity-mapped and have stable startMarkers;
				// each moved block becomes the next iteration's anchor.
				for (let j = dCount - 1; j >= 0; j--) {
					const i = _disp[j];
					const block = oldItems.get(newKeys[i])!;
					const anchor: Node =
						i + 1 < newMidLen ? oldItems.get(newKeys[i + 1])!.startMarker! : endAnchor;
					if (next === null) moveBlockBefore(block, anchor);
					else next.out.push(moveBlockBefore, block, anchor);
				}
				// Relink prev/next around each displaced position. Non-displaced
				// neighbours of displaced blocks get their boundary pointers updated
				// here too; non-displaced blocks BETWEEN two displaced positions keep
				// their internal pointers (they were never touched by the survivor
				// walk and the moves above don't reorder them).
				for (let j = 0; j < dCount; j++) {
					const i = _disp[j];
					const block = oldItems.get(newKeys[i])!;
					const prev = i > 0 ? oldItems.get(newKeys[i - 1])! : beforeMiddle;
					const next = i + 1 < newMidLen ? oldItems.get(newKeys[i + 1])! : afterMiddle;
					block.prevSibling = prev;
					block.nextSibling = next;
					if (prev) prev.nextSibling = block;
					else state.head = block;
					if (next) next.prevSibling = block;
					else state.tail = block;
				}
				// Boundary patch: the first and last block of the NEW middle may be
				// identity-mapped (not in _disp), in which case the displacement
				// loop never touched them — they still carry their pre-reconcile
				// neighbour pointers, which can be stale (e.g. pointing at a block
				// that the survivor walk just unmounted, or at a prior-reconcile
				// neighbour that has since shifted). Always re-pin the boundary
				// pointers so state.head / state.tail / beforeMiddle.next /
				// afterMiddle.prev are correct for the next reconcile.
				//
				// Repro for why this matters: surfaced by fuzz-keyed-list seed
				// -1491785866 — a `replace-all` that shrinks the list (e.g. 6 → 3)
				// where the last survivor is identity-mapped. Without the patch,
				// state.tail keeps pointing at the prior-tail block (now deleted)
				// and the surviving last block's .nextSibling still points at the
				// removed sibling. The next reconcile then stops its old-middle
				// walk early (at the stale nextSibling) and re-mounts the
				// last survivor as a NEW block, producing a duplicate row.
				const newMidFirst = oldItems.get(newKeys[0])!;
				const newMidLast = oldItems.get(newKeys[newMidLen - 1])!;
				newMidFirst.prevSibling = beforeMiddle;
				newMidLast.nextSibling = afterMiddle;
				if (beforeMiddle) beforeMiddle.nextSibling = newMidFirst;
				else state.head = newMidFirst;
				if (afterMiddle) afterMiddle.prevSibling = newMidLast;
				else state.tail = newMidLast;
				return;
			}
		}

		if (journalShape || record !== null) journalForSlot(state);
		if (next === undefined) next = listNext(state, parentBlock, at);
		// Place survivors first, then mount new rows in authored order. Reversing
		// mounts reverses their ref/layout/effect order even when the DOM is right.
		const middleEndAnchor: Node = afterMiddle ? afterMiddle.startMarker! : state.end;
		if (patched === newMidLen) {
			// A pure reorder has no mount callbacks to sequence. Move and relink
			// in one backward walk, keeping the established reorder cost.
			const seq = lis(sources, newMidLen);
			let seqIdx = seq.length - 1;
			let nextBlock = afterMiddle;
			for (let i = newMidLen - 1; i >= 0; i--) {
				const block = oldItems.get(newKeys[i])!;
				if (seqIdx < 0 || i !== seq[seqIdx]) {
					const anchor = nextBlock ? nextBlock.startMarker! : middleEndAnchor;
					if (next === null) moveBlockBefore(block, anchor);
					else next.out.push(moveBlockBefore, block, anchor);
				} else seqIdx--;
				block.nextSibling = nextBlock;
				if (nextBlock) nextBlock.prevSibling = block;
				else state.tail = block;
				nextBlock = block;
			}
			nextBlock!.prevSibling = beforeMiddle;
			if (beforeMiddle) beforeMiddle.nextSibling = nextBlock;
			else state.head = nextBlock;
			return;
		}
		if (moved) {
			const seq = lis(sources, newMidLen);
			let seqIdx = seq.length - 1;
			let anchor = middleEndAnchor;
			for (let i = newMidLen - 1; i >= 0; i--) {
				if (sources[i] === -1) continue;
				const block = oldItems.get(newKeys[i])!;
				if (seqIdx < 0 || i !== seq[seqIdx]) {
					if (next === null) moveBlockBefore(block, anchor);
					else next.out.push(moveBlockBefore, block, anchor);
				} else seqIdx--;
				anchor = block.startMarker!;
			}
		}
		let previous = beforeMiddle;
		let nextSurvivor = 0;
		for (let i = 0; i < newMidLen; i++) {
			const key = newKeys[i];
			let block: Block;
			if (sources[i] === -1) {
				if (nextSurvivor <= i) {
					nextSurvivor = i + 1;
					while (nextSurvivor < newMidLen && sources[nextSurvivor] === -1) nextSurvivor++;
				}
				const anchor =
					nextSurvivor < newMidLen
						? oldItems.get(newKeys[nextSurvivor])!.startMarker!
						: middleEndAnchor;
				const targetIdx = i + prefixLen;
				block = mountItem(
					parentBlock,
					parentNode,
					anchor,
					items[targetIdx],
					targetIdx,
					key,
					itemBody,
					state,
					singleRoot,
					ssrMarkerless,
					null,
					true,
					next,
				);
				oldItems.set(key, block);
				state.size++;
			} else block = oldItems.get(key)!;
			block.prevSibling = previous;
			if (previous) previous.nextSibling = block;
			else state.head = block;
			previous = block;
		}
		previous!.nextSibling = afterMiddle;
		if (afterMiddle) afterMiddle.prevSibling = previous;
		else state.tail = previous;
	} finally {
		if (
			sources.length <= MAX_KEYED_REORDER_SCRATCH &&
			(keyedReorderSources === null || keyedReorderSources.length < sources.length)
		) {
			keyedReorderSources = sources;
		}
	}
}

/**
 * How many items a SHARED-parent clear needs before the scoped Range beats
 * walking the marker span. Measured in Chromium (Playwright, 101 trials per
 * point, alternating order, batched above the 100us clock clamp), clearing
 * 4-node items out of a 3000-node document:
 *
 *   items      10     25     50    100-600    1000    2000
 *   range/walk 2.21x  1.58x  1.34x  ~1.0x     0.88x   0.92x
 *
 * The walk wins outright while Range's fixed setup dominates, the two are
 * within run-to-run noise across the middle band (the ratio flips between
 * runs there; Range's absolute times are stable, the walk's are not), and
 * Range pulls reproducibly ahead by ~8-12% once the per-node call overhead
 * dominates. The boundary sits at the TOP of the noise band rather than the
 * bottom: nothing measurable is given up in a browser either way, while the
 * walk is worth far more everywhere else — jsdom's `deleteContents` decides
 * containment with a boundary-point comparison per candidate node, each of
 * which can walk the whole document, so the Range path costs
 * O(items x document) there (266x the walk at 100 items in a 3400-node
 * document, and it grows with PAGE size, not list size).
 */
export const RANGE_CLEAR_MIN_ITEMS = 512;

/**
 * Bulk-clear a forBlock's items. When the forBlock owns its parent (markers
 * bracket the entire content), uses `textContent = ''` — the fastest DOM clear
 * on Chromium per Ripple's measured advantage on the `clear` op. A shared
 * parent keeps neighbours intact by clearing only the marker span: a sibling
 * walk, or a scoped Range once the list is large enough to pay for it
 * (RANGE_CLEAR_MIN_ITEMS).
 *
 * Every item still gets a disposal pass: items whose scope carries cleanups,
 * hooks, effects, refs, child scopes, or slot-stashed Blocks (a cross-module
 * `<Row/>` lives on the item's `_slots` as a componentSlot, NOT on `.children`)
 * tear down through `unmountBlock(b, false)` — full scope walk incl. `_slots`,
 * portal self-detach from foreign targets, and trySlot bookkeeping — with the
 * DOM skipped because the batch clear already removed the whole range. Plain
 * template rows (the common bulk-clear case) hit only the field guard. A
 * committed list does all of this at its commit (clearItems).
 */
export function batchClearItems(
	state: ForSlot,
	oldItems: Map<any, Block>,
	next: SlotNext | null = null,
): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.LIST_REMOVE, state.size);
	const head = state.head;
	const start = state.start;
	const end = state.end;
	const size = state.size;
	// A committed list's rows stay connected until its commit clears them,
	// before its later runs land.
	if (next !== null) {
		retireBlocks(head, next.tx, false);
		next.out.push(() => clearItems(head, start, end, size), null, null);
	} else clearItems(head, start, end, size);
	oldItems.clear();
}

function mountItem<T>(
	parentBlock: Block,
	parentNode: Node,
	// Null appends: a committed list's fresh run (listRun).
	anchor: Node | null,
	item: T,
	index: number,
	key: unknown,
	body: (item: T, s: Scope) => void,
	forSlot: ForSlot,
	// true = compiler-proven single-element item body (compiled @for). 2 = the
	// DE-OPT sentinel (marker-elision M4): decide PER ITEM at mount — a pure
	// single-element host descriptor self-marks like the compiled path (its one
	// rendered element becomes both markers); anything else (null / primitive /
	// component-bearing) keeps the `it` pair. A later shape flip promotes the
	// self-marked block to a minted pair in place (see deoptItemBody).
	singleRoot: boolean | 2,
	// A compiled row whose server body the compiler proved a direct host: it has
	// no range of its own on the wire. A descriptor item (singleRoot 2) decides
	// by its value instead (selfDelimits). 2 = a sole-component row whose
	// component's template inserts its one root: it has a range on the wire, and
	// on the client keeps that root detached until commit too.
	ssrMarkerless: boolean | 2,
	// Pure-host → blocks upgrade adoption: an existing raw child node this item
	// should take over IN PLACE (self-marked directly, or markers minted around
	// it, seeded as the item block's deoptNode so the body's pure path patches
	// instead of rebuilding).
	adoptNode: Node | null = null,
	// A list update inserts this row beside rows it already rendered.
	inserted = false,
	// A committed list's pending structure (listNext): the row renders off the
	// document and lands before `anchor` at commit.
	next: SlotNext | null = null,
): Block {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.LIST_INSERT);
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) {
		// A row that a list update inserts beside rows that already adopted the
		// server's, as in a suspended deferred boundary's retry after its captures
		// changed, is one the server never rendered, and the cursor belongs to
		// other blocks' server nodes: it builds as a client mount would, below.
		if (!inserted) {
			const node = hydration.node;
			// A descriptor item delimits itself by its value (selfDelimits), as the
			// server decided for the same value.
			const descriptor = singleRoot === 2;
			if (
				descriptor
					? isElementDescriptor(item) && selfDelimits(item.type, descNeedsBlocks(item))
					: ssrMarkerless === true
			) {
				// The outer @for pair is the only list framing on the wire. Each proven
				// direct-host item self-delimits, exactly like the existing client-mount
				// singleRoot path: its template adopts the element at the cursor. A
				// de-opt item adopts only an element of its own tag.
				if (
					node !== null &&
					node !== forSlot.end &&
					!isBlockOpen(node) &&
					(!descriptor ||
						(node.nodeType === 1 &&
							node.parentNode === parentNode &&
							isHostElementOfType(node as Element, (item as ElementDescriptor).type as string)))
				) {
					const block = createBlock(
						'control-flow',
						parentBlock,
						parentNode,
						node,
						node,
						body as ComponentBody,
						item,
						forSlot.env,
					);
					block.forSlot = forSlot;
					block.key = key;
					block.itemIndex = index;
					if (descriptor) block.deoptNode = node;
					renderBlock(block);
					hydration.node = block.endMarker?.nextSibling ?? getNextSibling(node);
					return block;
				}
			} else if (isBlockOpen(node)) {
				// Hydration: the server wraps each GENERAL-SHAPE item in its own
				// `<!--[-->…<!--]-->` range.
				const itemEnd = hydration.close(node as Node);
				hydration.node = getNextSibling(node!);
				const block = createBlock(
					'control-flow',
					parentBlock,
					parentNode,
					node,
					itemEnd,
					body as ComponentBody,
					item,
					forSlot.env,
				);
				block.forSlot = forSlot;
				block.key = key;
				block.itemIndex = index;
				renderBlock(block);
				hydration.node = getNextSibling(itemEnd);
				return block;
			}
			// The server rendered fewer items than the client, or at the cursor an item
			// that cannot be this one: a bare item where this one needs a range of its
			// own, or an item of another tag.
			hydration.fail(
				process.env.NODE_ENV !== 'production'
					? (forSlot.end.parentNode as any)?.__oct_loc
					: undefined,
				() =>
					descriptor && isHostDescriptor(item) && !descNeedsBlocks(item)
						? `<${item.type as string}>`
						: 'another list item',
				hydration.node,
			);
		}
		const block = hydration.suspend(() =>
			mountItem(
				parentBlock,
				parentNode,
				anchor,
				item,
				index,
				key,
				body,
				forSlot,
				singleRoot,
				ssrMarkerless,
			),
		);
		return block;
	}
	// Any other row of a committed list renders into a run fragment.
	if (next !== null && !(singleRoot === true && ssrMarkerless)) {
		parentNode = listRun(next, anchor!);
		anchor = null;
	}
	if (
		singleRoot === true ||
		(singleRoot === 2 && isHostDescriptor(item) && !descNeedsBlocks(item))
	) {
		// Compiler verified the body emits exactly one Element root (true) — or,
		// on the de-opt sentinel (2), the ITEM VALUE is a pure single-element
		// host descriptor, which deoptItemBody's raw path always renders as
		// exactly one node. Skip the per-item Comment markers and use the
		// inserted element as both start and end. For a 1000-row table that
		// means 2000 fewer DOM nodes inside <tbody>, which the browser's
		// layout/paint walks every time. Big paint win when the slowdown is
		// "tbody has 3000 children" not "JS is slow".
		if (adoptNode !== null) {
			// Upgrade adoption on the self-marked path: the adopted raw node IS
			// the item's single element, already in position — no markers, no
			// insert. Seed it as both markers AND the block's deoptNode so the
			// body's raw path can reuse a matching tag or replace a changed tag.
			const block = createBlock(
				'control-flow',
				parentBlock,
				parentNode,
				adoptNode,
				adoptNode,
				body as ComponentBody,
				item,
				forSlot.env,
			);
			block.forSlot = forSlot;
			block.key = key;
			block.itemIndex = index;
			block.deoptNode = adoptNode;
			preserveRootCreatedDom(block);
			renderBlock(block);
			return block;
		}
		// A committed list's direct-host or sole-component row, whose template
		// inserts its one root, keeps that root detached until commit (DETACHED_ROOT).
		const detached = next !== null && singleRoot === true && ssrMarkerless !== false;
		const block = createBlock(
			'control-flow',
			parentBlock,
			parentNode,
			null,
			detached ? (DETACHED_ROOT ?? newDetachedRoot()) : anchor,
			body as ComponentBody,
			item,
			forSlot.env,
		);
		block.forSlot = forSlot;
		block.key = key;
		block.itemIndex = index;
		try {
			renderBlock(block);
		} catch (error) {
			discardThrownItem(block, error, detached ? null : parentNode, anchor);
			throw error;
		}
		if (detached) {
			// listRoots, inlined: a fill adds one row per call.
			const out = next!.out;
			const n = out.length;
			if (n !== 0 && out[n - 3] === placeRoots && out[n - 1] === anchor) out[n - 2].push(block);
			else out.push(placeRoots, [block], anchor);
			return block;
		}
		// Body inserted ONE node right before `anchor` via
		// `__block.parentNode.insertBefore(_root, __block.endMarker)`. Grab it
		// and promote it to start === end. From now on `block.endMarker` is the
		// actual element (so subsequent body re-renders insert nothing — the
		// update path mutates the cached _b._el$N refs directly).
		const root = (anchor === null ? parentNode.lastChild : anchor.previousSibling)!;
		block.startMarker = root;
		block.endMarker = root;
		return block;
	}
	const start = document.createComment('it');
	const end = document.createComment('/it');
	// An adopted row keeps its raw node where it sits (identity, focus and input
	// state survive): its pair wraps it at commit (placeUpgradedList).
	if (adoptNode === null) {
		parentNode.insertBefore(start, anchor);
		parentNode.insertBefore(end, anchor);
	}
	const block = createBlock(
		'control-flow',
		parentBlock,
		parentNode,
		start,
		end,
		body as ComponentBody,
		item,
		forSlot.env,
	);
	block.forSlot = forSlot;
	block.key = key;
	block.itemIndex = index;
	if (adoptNode !== null) {
		block.deoptNode = adoptNode;
		preserveRootCreatedDom(block);
	}
	try {
		renderBlock(block);
	} catch (error) {
		discardThrownItem(block, error, null, null);
		throw error;
	}
	return block;
}

/**
 * The caller cannot receive or register an item Block whose initial render
 * threw, so remove its owned DOM and hook scopes now; a Suspense retry mounts
 * it afresh as part of the list transaction. A self-marked item (`parent`
 * given) has no range yet, but its body may already have inserted its one root
 * before `anchor` when a child suspended. commitBag stores the template bag
 * in slot 0 only after that insert, so a bag there proves the node before the
 * anchor is this item's root. A sole component or `@if` root lives in a nested
 * slot instead, whose own Block owns and removes its element.
 */
function discardThrownItem(
	block: Block,
	error: unknown,
	parent: Node | null,
	anchor: Node | null,
): void {
	const bag = block.slots[0];
	if (parent !== null && bag != null && (bag as any).__kind === undefined) {
		const root = lastBefore(parent, anchor);
		block.startMarker = root;
		block.endMarker = root;
	}
	if (isSuspenseException(error)) retainDiscardedWarmMemos(block);
	unmountBlock(block, !ROOT_RENDER_TRANSACTION?.retainedCreated?.has(block));
}

/** The node before `anchor` in `parent`, or its last child for a null anchor. */
function lastBefore(parent: Node, anchor: Node | null): ChildNode | null {
	return anchor === null ? parent.lastChild : anchor.previousSibling;
}

export function moveBlockBefore(block: Block, anchor: Node): void {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.LIST_MOVE);
	const parent = block.startMarker!.parentNode!;
	const end = block.endMarker!;
	let n: Node | null = block.startMarker!;
	if (renderingFocus !== null) {
		captureFocusedMovement(parent, renderingFocus);
		moveFocusedBlockBefore(parent, n, end, anchor, renderingFocus);
		return;
	}
	// Walk by checking `n === end` BEFORE moving. The previous design captured
	// `stop = endMarker.nextSibling` at function entry, then iterated until
	// `n === stop`. That breaks when the block range has multi-root content
	// (e.g. fragment items with start/end Comment markers + N body nodes):
	// after moving start + body nodes adjacent to `anchor`, the rest of the
	// range (including `endMarker`) sits at the OLD position. When the walker
	// finally reaches `endMarker`, its captured `nextSibling` points BACK to
	// the already-moved start (now adjacent at `endMarker`'s new neighbour
	// position), so the walker loops back into the range and never terminates.
	while (n) {
		const isEnd = n === end;
		const next: Node | null = getNextSibling(n);
		parent.insertBefore(n, anchor);
		if (isEnd) break;
		n = next;
	}
}

function moveFocusedBlockBefore(
	parent: Node,
	node: Node,
	end: Node,
	anchor: Node,
	snapshots: Exclude<FocusSelectionBatch, null>,
): void {
	let current: Node | null = node;
	while (current !== null) {
		const isEnd = current === end;
		const next: Node | null = getNextSibling(current);
		moveFocusedNodeBefore(parent, current, anchor, snapshots);
		if (isEnd) break;
		current = next;
	}
}

export function moveFocusedNodeBefore(
	parent: Node,
	node: Node,
	anchor: Node | null,
	snapshots: Exclude<FocusSelectionBatch, null>,
): void {
	let snapshot: FocusSelectionSnapshot | null = null;
	if (Array.isArray(snapshots)) {
		for (let i = 0; i < snapshots.length; i++) {
			if (snapshots[i].focused.ownerDocument === node.ownerDocument) {
				snapshot = snapshots[i];
				break;
			}
		}
	} else if (snapshots.focused.ownerDocument === node.ownerDocument) {
		snapshot = snapshots;
	}
	moveNativeNodeBefore(
		parent,
		node,
		anchor,
		snapshot?.focused ?? null,
		snapshot?.contentEditable ?? false,
	);
}

/**
 * Longest Increasing Subsequence — returns indices into `arr` whose values form the LIS.
 * Skips entries where arr[i] === -1 (new items).
 * Ported from the standard O(n log n) patience-sort algorithm used by Ripple/Solid/Vue.
 */
function lis(arr: Int32Array, n: number): number[] {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.LIST_LIS);
	let p = keyedLisPredecessors;
	if (p === null || p.length < n) {
		p = new Int32Array(n);
		if (n <= MAX_KEYED_REORDER_SCRATCH) keyedLisPredecessors = p;
	}
	const result: number[] = [];
	for (let i = 0; i < n; i++) {
		const v = arr[i];
		if (v === -1) continue;
		if (result.length === 0 || arr[result[result.length - 1]] < v) {
			p[i] = result.length === 0 ? -1 : result[result.length - 1];
			result.push(i);
			continue;
		}
		// Binary search for the smallest tail >= v.
		let lo = 0,
			hi = result.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (arr[result[mid]] < v) lo = mid + 1;
			else hi = mid;
		}
		if (v < arr[result[lo]]) {
			p[i] = lo > 0 ? result[lo - 1] : -1;
			result[lo] = i;
		}
	}
	// Reconstruct.
	let u = result.length;
	let v = result[u - 1];
	while (u-- > 0) {
		result[u] = v;
		v = p[v];
	}
	return result;
}
