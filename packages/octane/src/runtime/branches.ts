// Branches
//
// `@if` and `@switch` branch slots, markerless arms and lite arms.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './child-slots.js';
import { hydrating } from '../hydration-flag.js';
import { __profileCount, ProfileCounter, __profileArm } from '../profiling.js';
import { BINDING_OPEN_PREFIX } from '../dom-binding-protocol.js';
import { signalDocumentEnabled } from '../signals/document-owner.js';
import type { ComponentBody, Scope, SignalRetryLocation, Block, SlotNext } from './types.js';
import { NATIVE_READ_DRIVER, ROOT_RENDER_ROLLBACK } from './drivers.js';
import { SIGNAL_RETRY_LOCATIONS, renderBlock } from './signal-owners.js';
import { journalRootProperty, journalRootSlot, isCreatedInRootRender } from './engine.js';
import { isSuspenseException } from './use.js';
import { SHARED_BODY_SCOPE } from './context.js';
import { CURSOR, END_OF_CONTENT } from './hydration.js';
import { isBlockOpen } from '../stream-protocol.js';
import {
	ScopeImpl,
	createBlock,
	RETURNED_OUTPUT_SCOPE,
	setReturnedOutputOwner,
	LiteBlockImpl,
	unmountBlock,
	registerSlot,
	releaseLiteArm,
} from './block.js';
import {
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	discardFrontierBlock,
	renderLiteArm,
} from './render.js';
import { removeRange } from './lists.js';
import {
	slotNext,
	slotFrontier,
	queueFrontier,
	NO_MEMBERS,
	noteFrontierMember,
	usesFrontier,
	queueSlotDeletion,
	queueRootUnmount,
	DETACHED_ROOT,
	newDetachedRoot,
	journalObjectOnce,
} from './commit.js';
import { getFirstChild, getNextSibling } from './templates.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// ---------------------------------------------------------------------------
// Control flow: branch slots — ifBlock (@if/@else) and switchBlock (@switch)
// ---------------------------------------------------------------------------
//
// Both lower to the SAME one-branch-mounted-at-a-time state machine; only the
// branch RESOLUTION differs (a boolean picking then/else vs `===` over the case
// tests). Each keeps its own slot init (hydration marker adoption differs — see
// the callers), resolves the next branch index + body, and hands the swap /
// re-render to `renderBranchSlot`, the single copy of the machinery.

/**
 * Common slot shape behind IfSlot / SwitchSlot — everything renderBranchSlot
 * touches. See the field docs on IfSlot; the two differ only in `__kind` and
 * in how `branch` is encoded.
 */
interface BranchSlot {
	__kind: 'ifBlockSlot' | 'switchBlockSlot';
	anchor: Node | null;
	start: Comment | null;
	end: Node | null;
	/** Hydration compaction borrowed this slot's pair from its sole-range parent. */
	borrowed: boolean;
	branch: number;
	block: Block | null;
	/**
	 * The active arm when it renders without a Block of its own: a Scope whose
	 * stand-in (`lite.block`) carries the DOM context and the arm's bound. Only
	 * an arm the compiler proved hookless gets one, on a client mount under a
	 * root render that also created its owning Block (liteArmAllowed). At most
	 * one of `block` and `lite` is set.
	 */
	lite: Scope | null;
	/**
	 * A markerless arm threw before inserting anything, so its mount is
	 * incomplete: it owns no DOM, so it retains no bound. Siblings can replace
	 * or remove the node that preceded it, or stage a replacement right after
	 * that node, before it renders again (renderMarkerlessArm). A hydration
	 * retry that resumes a leaf inside it records where that leaf's content
	 * starts on the arm block's `startMarker` instead (pendingArmBefore).
	 */
	unfinalized: boolean;
	/** Pending structure in the open root render (SlotNext). */
	next: SlotNext | null;
}

/**
 * @internal The insertion anchor of a control-flow-only body's root that shares
 * the body's end marker with a later sibling root. An empty @if/@switch arm, or
 * a lite component rendering one, keeps no DOM of its own, so content it
 * mounted later would land before that shared marker, after those siblings.
 * When a client render creates the slot, mint it a comment of its own at its
 * source position. The writer reads its anchor only while creating the slot,
 * and a hydrating slot adopts the server's range, which already bounds it.
 *
 * A render that schedules its own update mid-body replays before its slots
 * settle, and its slot writers create nothing until then. Nothing is minted
 * until the replay either, which reaches every slot in source order.
 */
export function ownSlotAnchor(scope: Scope, slotKey: number, block: Block): Node | null {
	const anchor = block.endMarker;
	const parent = block.parentNode;
	const hydration = hydrating ? CURSOR : null;
	if (
		scope.slots[slotKey] !== undefined ||
		hydration !== null ||
		(CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate)
	)
		return anchor;
	const own = document.createComment('');
	// A committed Block's new slot, as a resumed body's, lands at commit.
	if (usesFrontier(block, parent)) queueFrontier(block, parent, anchor).appendChild(own);
	else parent.insertBefore(own, anchor);
	return own;
}

/** Count direct root slots, and retarget their provisional anchors to `end` when given. */
export function markerlessBranchRoots(
	scope: Scope,
	domParent: Node,
	after: Node | null,
	end?: Node | null,
): number {
	let roots = 0;
	const slots = scope._slots;
	if (slots !== null) {
		// Nested template directives have distinct anchors. Appended component
		// children can share null anchors, so also check their owning host.
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			if (
				slot.anchor === after &&
				(slot.__kind === 'ifBlockSlot' ||
					slot.__kind === 'switchBlockSlot' ||
					(slot.__kind === 'componentSlotSlot' && slot.block?.parentNode === domParent))
			) {
				roots++;
				if (end !== undefined) {
					journalRootProperty(slot, 'anchor', slot.anchor);
					slot.anchor = end;
					// A single-root call that has not rendered its root yet inserts
					// before its Block's end, which is the same anchor.
					const block = slot.block;
					if (block != null && block.endMarker === after) {
						journalRootProperty(block, 'endMarker', block.endMarker);
						block.endMarker = end;
					}
				}
			}
		}
	}
	// Lite components retain their insertion context and may themselves contain
	// empty root slots. Nested host children have a different parent, even when
	// both insertion anchors are null, and must keep that host's context.
	const children = scope.children;
	if (children !== null) {
		for (let i = 0; i < children.length; i++) {
			const child = children[i].scope;
			const block = child.block;
			if (block !== scope.block && block.parentNode === domParent && block.endMarker === after) {
				roots += markerlessBranchRoots(child, domParent, after, end) || 1;
				if (end !== undefined) {
					journalRootProperty(block, 'endMarker', block.endMarker);
					block.endMarker = end;
				}
			}
		}
	}
	return roots;
}

/**
 * Publish the DOM boundary of a markerless arm. Its content lies after
 * `before` and before `after`, where its root slots were anchored. A body that
 * threw (`complete` false) has not reached its later slots, so the element it
 * inserted may be the first of several roots: only a completed body can
 * self-mark with it.
 */
function finalizeMarkerlessBranch(
	state: BranchSlot,
	domParent: Node,
	scope: Scope,
	marker: string,
	before: Node | null,
	after: Node | null,
	complete: boolean,
): void {
	state.unfinalized = false;
	if (state.borrowed && state.start === null) return;
	const first = before ? getNextSibling(before) : getFirstChild(domParent);
	const last = after ? after.previousSibling : domParent.lastChild;
	// One current element is not a sole root when an empty sibling slot can
	// later produce more output at the same provisional insertion anchor.
	if (
		complete &&
		last !== null &&
		first === last &&
		first.nodeType === 1 &&
		markerlessBranchRoots(scope, domParent, after) <= 1
	) {
		scope.block.startMarker = first;
		scope.block.endMarker = first;
		state.end = first;
	} else delimitMarkerlessBranch(state, domParent, scope, marker, first, after);
}

/**
 * The node before the content of a client arm without a bound
 * (`unfinalized`). It inserted nothing, so that is whatever precedes its
 * insertion anchor now.
 */
function pendingArmBefore(block: Block, domParent: Node): Node | null {
	const end = block.endMarker;
	return end ? end.previousSibling : domParent.lastChild;
}

/**
 * Render a client markerless arm that owns no DOM yet: a first mount, or a
 * retry of an arm that threw before inserting anything. Its content starts
 * after whatever precedes it now (pendingArmBefore). An arm that throws before
 * inserting anything stays `unfinalized` so its retry finalizes it. One that already inserted content owns that DOM now:
 * finalize it so teardown can remove it (a discarded keyed item otherwise
 * strands the partial row).
 */
function renderMarkerlessArm(
	state: BranchSlot,
	domParent: Node,
	scope: Scope,
	marker: string,
	body?: ComponentBody,
	env?: any[],
): void {
	const block = scope.block;
	const after = block.endMarker;
	// The retry of an arm over committed DOM builds off-document: in a frontier
	// its commit inserts before `after`, ending at a sentinel its pending
	// structure anchors on until then (moveArmPending).
	let parent = domParent;
	let end = after;
	if (!hydrating && usesFrontier(block.parentBlock!, domParent)) {
		const frag = queueFrontier(block.parentBlock, domParent, after);
		end = frontierSentinel(frag, '');
		moveArmPending(scope, domParent, after, frag, end);
		moveToFrontier(scope, domParent, after, frag, end);
		parent = frag;
	}
	const before = pendingArmBefore(block, parent);
	state.unfinalized = true;
	try {
		if (scope === block) renderBlock(block);
		else renderLiteArm(scope, body!, env);
	} catch (error) {
		if ((before ? getNextSibling(before) : getFirstChild(parent)) !== end)
			finalizeMarkerlessBranch(state, parent, scope, marker, before, end, false);
		if (parent !== domParent)
			releaseFrontierSentinel(scope, parent as DocumentFragment, end as Comment, after);
		throw error;
	}
	finalizeMarkerlessBranch(state, parent, scope, marker, before, end, true);
	if (parent !== domParent)
		releaseFrontierSentinel(scope, parent as DocumentFragment, end as Comment, after);
}

/**
 * Move an unfinalized arm's pending structure, anchored on `after` in
 * `domParent`, onto a frontier's sentinel `end`. It owns no DOM yet, so its
 * retry renders there; its commit rehomes it (applySlotNext).
 */
function moveArmPending(
	scope: Scope,
	domParent: Node,
	after: Node | null,
	frag: DocumentFragment,
	end: Node,
): void {
	const slots = scope._slots;
	if (slots !== null)
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			if (
				slot.anchor !== after ||
				(slot.__kind !== 'ifBlockSlot' &&
					slot.__kind !== 'switchBlockSlot' &&
					slot.__kind !== 'componentSlotSlot')
			)
				continue;
			journalRootProperty(slot, 'anchor', slot.anchor);
			slot.anchor = end;
			const arm = slot.block ?? slot.lite;
			if (arm != null && arm.block.parentNode === domParent) {
				moveArmPending(arm, domParent, after, frag, end);
				moveToFrontier(arm, domParent, after, frag, end);
			}
		}
	const children = scope.children;
	if (children !== null)
		for (let i = 0; i < children.length; i++) {
			const child = children[i].scope;
			const block = child.block;
			if (block !== scope.block && block.parentNode === domParent && block.endMarker === after) {
				moveArmPending(child, domParent, after, frag, end);
				moveToFrontier(child, domParent, after, frag, end);
			}
		}
}

function moveToFrontier(
	scope: Scope,
	domParent: Node,
	after: Node | null,
	frag: DocumentFragment,
	end: Node,
): void {
	const block = scope.block;
	journalRootProperty(block, 'parentNode', domParent);
	block.parentNode = frag;
	if (block.endMarker === after) {
		journalRootProperty(block, 'endMarker', after);
		block.endMarker = end;
	}
	noteFrontierMember(frag, scope);
}

/**
 * Point what anchors on sentinel `from` in `scope` at `to`: its Block's end, its
 * slots, and the arms and children still pending on it, nested ones included.
 * One with a bound of its own holds its content's anchors inside that bound.
 * Nothing here needs a journal entry: what anchors on a sentinel is new in this
 * render, or moveArmPending journaled it.
 */
function retargetPending(scope: Scope, from: Node, to: Node | null): void {
	const block = scope.block;
	const slots = scope._slots;
	if (slots !== null)
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			if (slot.anchor === from) slot.anchor = to;
			const arm = slot.block ?? slot.lite;
			if (arm != null && arm.block.endMarker === from) retargetPending(arm, from, to);
		}
	const children = scope.children;
	if (children !== null)
		for (let i = 0; i < children.length; i++) {
			const child = children[i].scope;
			if (child.block !== block && child.block.endMarker === from) retargetPending(child, from, to);
		}
	if (block.endMarker === from) block.endMarker = to;
}

/** Bound a markerless arm's content, from `first` up to `after`, with a marker pair. */
function delimitMarkerlessBranch(
	state: BranchSlot,
	domParent: Node,
	scope: Scope,
	marker: string,
	first: Node | null,
	after: Node | null,
): void {
	const start = document.createComment(marker);
	const end = document.createComment('/' + marker);
	domParent.insertBefore(start, first ?? after);
	domParent.insertBefore(end, after);
	const block = scope.block;
	block.startMarker = start;
	block.endMarker = end;
	// A lite arm's pair belongs to its slot, which keeps it for the next arm.
	if (block === scope) block.exclusiveMarkers = true;
	state.start = start;
	state.end = end;
	markerlessBranchRoots(scope, domParent, after, end);
}

/** The nearest real Block that owns a Scope's output; lite stand-ins are not Blocks. */
export function owningBlock(block: Block): Block {
	return block instanceof LiteBlockImpl ? block.ownerBlock : block;
}

/**
 * Whether an arm the compiler proved hookless may render in a Scope of its own
 * rather than a Block. A root render must have created the arm's owning Block:
 * that Block's creation undo then discards the arm with it, and a later root
 * render that swaps the arm out defers its teardown to the commit, as it does a
 * committed Block's (unmountLiteArm). Hydration, signal ownership and native
 * reads keep their per-Block bookkeeping.
 */
function liteArmAllowed(parentScope: Scope): boolean {
	const transaction = ROOT_RENDER_TRANSACTION;
	return (
		transaction !== null &&
		!hydrating &&
		!NATIVE_READ_DRIVER &&
		!signalDocumentEnabled &&
		parentScope !== SHARED_BODY_SCOPE &&
		parentScope.block.idState.renderOwner?.signalOwner === undefined &&
		isCreatedInRootRender(transaction, owningBlock(parentScope.block))
	);
}

// Core slot teardown reaches a lite arm only through a slot that mounted one,
// which installs this. A root without control flow then carries none of it.
export let UNMOUNT_LITE_ARM: ((state: BranchSlot, detachDom: boolean) => void) | null = null;

/**
 * Remove a slot's lite arm: its Scope and, with `detachDom`, its DOM. A pair
 * that delimits the arm stays for the slot's next arm, as an arm Block's
 * borrowed markers do. When a root render that did not create the arm removes
 * it, the release and the removal wait for the commit, as a committed Block's
 * do (queueRootUnmount).
 */
function unmountLiteArm(state: BranchSlot, detachDom: boolean): void {
	const scope = state.lite!;
	const arm = scope.block;
	state.lite = null;
	// A pair that delimits the arm belongs to its slot, as an arm Block's does.
	const exclusive = arm.startMarker === state.start;
	const transaction = ROOT_RENDER_TRANSACTION;
	if (
		transaction !== null &&
		!transaction.aborted &&
		!ROOT_RENDER_ROLLBACK &&
		arm.idState.renderOwner === transaction.owner &&
		!isCreatedInRootRender(transaction, owningBlock(arm))
	) {
		queueRootUnmount(scope, exclusive);
		return;
	}
	const start = arm.startMarker;
	const end = arm.endMarker;
	releaseLiteArm(scope);
	// As unmountBlock does, remove the range after its cleanups ran.
	if (detachDom && start !== null && end !== null && start.parentNode !== null)
		removeRange(exclusive ? getNextSibling(start) : start, exclusive ? end : getNextSibling(end));
}

/**
 * A sole-root control-flow block may share its element boundary with one or
 * more enclosing sole-root blocks (for example a branch directly inside a
 * keyed item). When the inner branch replaces that element, keep every exact
 * borrower pointed at the new element/range so keyed moves and later teardown
 * never retain a detached boundary. A lite component's stand-in has no range
 * (startMarker undefined), so a borrower can sit above one: an arm whose only
 * output is a hookless call's inner branch.
 */
export function replaceSharedBlockBoundary(
	parent: Block | null,
	oldStart: Node | null,
	oldEnd: Node | null,
	newStart: Node | null,
	newEnd: Node | null,
): void {
	if (oldStart === null || oldEnd === null) return;
	for (let block = parent; block !== null; block = block.parentBlock) {
		if (block.startMarker === undefined) continue;
		if (block.startMarker !== oldStart || block.endMarker !== oldEnd) return;
		journalRootProperty(block, 'startMarker', block.startMarker);
		journalRootProperty(block, 'endMarker', block.endMarker);
		block.startMarker = newStart;
		block.endMarker = newEnd;
	}
}

export function sharesBlockBoundary(
	parent: Block | null,
	start: Node | null,
	end: Node | null,
): boolean {
	while (parent !== null && parent.startMarker === undefined) parent = parent.parentBlock;
	return (
		parent !== null &&
		start !== null &&
		end !== null &&
		parent.startMarker === start &&
		parent.endMarker === end
	);
}

/**
 * A branch swap in a root render over committed DOM (usesFrontier). The
 * outgoing arm stays connected and untouched; its deletion is queued on the
 * slot's commit entry. The incoming arm renders in the slot's frontier
 * fragment and takes the outgoing arm's place at commit. If the incoming arm
 * throws, its partial subtree leaves the fragment and the slot keeps the arm
 * it had, so the boundary that catches the throw holds that screen.
 *
 * A slot with a pair (its own, a borrowed one, or a borrowed whole container)
 * keeps it, and the incoming arm borrows it. A markerless slot's incoming arm
 * bounds itself: a lone element self-marks, anything else gets a pair.
 */
function swapBranchFrontier(
	parentScope: Scope,
	slotKey: number,
	state: BranchSlot,
	domParent: Node,
	next: number,
	body: ComponentBody | null,
	marker: string,
	env: any[] | undefined,
	lone: boolean | undefined,
): void {
	const parentBlock = parentScope.block;
	const transaction = ROOT_RENDER_TRANSACTION!;
	const oldScope: Scope | null = state.block ?? state.lite;
	const old = oldScope === null ? null : oldScope.block;
	if (old === null && body === null) {
		journalRootProperty(state, 'branch', state.branch);
		state.branch = next;
		return;
	}
	journalObjectOnce(state);
	// A fresh arm is an earlier swap's in this render: its content is in the fragment.
	const fresh = state.block !== null && isCreatedInRootRender(transaction, state.block);
	const paired = state.start !== null || state.borrowed;
	const oldStart = old === null ? null : old.startMarker;
	const oldEnd = old === null ? null : old.endMarker;
	let first: Node | null = null;
	let last: Node | null = null;
	// Where the incoming content lands among the committed nodes.
	let before: Node | null;
	if (paired) {
		before = state.end;
		if (old !== null && !fresh) {
			first = state.start === null ? getFirstChild(domParent) : getNextSibling(state.start);
			if (first === state.end) first = null;
			else last = state.end === null ? domParent.lastChild : state.end.previousSibling;
		}
	} else if (fresh) {
		before = state.next!.before;
	} else if (old === null) {
		before = state.anchor;
	} else if (state.unfinalized) {
		// A pending arm owns only what a resumed leaf inserted before its anchor.
		before = oldEnd;
		if (oldStart != null && oldStart !== before && oldStart.parentNode === domParent) {
			first = oldStart;
			last = before!.previousSibling;
		}
	} else {
		// A self-marked root. A nested sole-root branch can replace it without
		// refreshing `state.end`, so its Block holds the live bound.
		first = oldStart;
		last = oldEnd ?? state.end;
		if (first === null) {
			before = last;
			last = null;
		} else before = getNextSibling(last!);
	}
	// An earlier arm of this render that kept its root detached never landed.
	if (fresh) state.next!.root = null;
	// A markerless slot's arm that renders one template host keeps that root
	// detached, as a committed list's fresh row does (DETACHED_ROOT): no
	// fragment, no rehoming, and its commit inserts the root alone.
	lone = lone === true && body !== null && !paired && !fresh;
	const frag = lone
		? null
		: body !== null || fresh
			? slotFrontier(state, parentBlock, domParent, before)
			: state.next?.tx === transaction
				? state.next.frag
				: null;
	// The slot's pair, already built in this render's fragment.
	const pairInFrag = frag !== null && paired && state.end !== null && state.end.parentNode === frag;
	// The fragment's content before the incoming arm's: the fresh arm's, if any.
	const mark = pairInFrag ? state.end!.previousSibling : frag === null ? null : frag.lastChild;
	let arm: Block | null = null;
	let suspended: unknown = null;
	let pending = false;
	if (body !== null) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.ARM_SWAP_OFFSCREEN);
		const end: Node = lone
			? (DETACHED_ROOT ?? newDetachedRoot())
			: pairInFrag
				? state.end!
				: frontierSentinel(frag!, '/' + marker);
		arm = createBlock(
			'control-flow',
			parentBlock,
			frag ?? domParent,
			null,
			end,
			body,
			undefined,
			env,
		);
		const retryLocation: SignalRetryLocation | undefined =
			parentBlock.idState.renderOwner?.signalOwner === undefined
				? undefined
				: {
						parent: parentScope,
						slot: slotKey,
						kind: state.__kind,
						branch: next,
						component: undefined,
						key: undefined,
					};
		if (retryLocation !== undefined) SIGNAL_RETRY_LOCATIONS.set(arm, retryLocation);
		try {
			renderBlock(arm);
		} catch (error) {
			// A replacement that throws leaves the committed arm in place. A first
			// arm that suspends stays the slot's pending arm, as an in-place mount
			// does, so its retry resumes this Block and its state.
			if (old !== null || !isSuspenseException(error)) {
				discardFrontierBlock(arm, parentBlock, error, retryLocation);
				if (frag !== null) removeAfter(frag, mark, pairInFrag ? end : null);
				throw error;
			}
			suspended = error;
		}
		if (owningBlock(parentBlock).disposed) return;
		const content =
			frag === null ? null : mark === null ? getFirstChild(frag) : getNextSibling(mark);
		if (lone) {
			const landing = slotNext(state);
			landing.parent = domParent;
			landing.before = before;
			landing.owner = owningBlock(parentBlock);
			landing.members = NO_MEMBERS;
			// commitBag self-marked the arm with its root, which lands at commit. A
			// first arm that suspended before its root lands where its anchor is.
			if (arm.endMarker !== end) landing.root = arm.startMarker;
			else {
				arm.endMarker = before;
				pending = true;
			}
		} else if (pairInFrag) {
			// The incoming arm borrows the pair this render built.
			arm.startMarker = state.start;
			arm.exclusiveMarkers = true;
		} else if (paired) {
			// A committed pair stays the slot's; the arm bounds its own content
			// inside it, so discarding the arm never reaches committed nodes.
			const start = document.createComment(marker);
			frag!.insertBefore(start, content);
			arm.startMarker = start;
			arm.exclusiveMarkers = true;
		} else if (
			suspended !== null &&
			content === end &&
			!(state.next!.bound !== null || sharesBlockBoundary(parentBlock, oldStart, oldEnd))
		) {
			// A pending arm owns nothing yet; its anchor is where it will land.
			releaseFrontierSentinel(arm, frag!, end as Comment, before);
			pending = true;
		} else if (
			suspended === null &&
			content !== end &&
			content === end.previousSibling &&
			content!.nodeType === 1 &&
			markerlessBranchRoots(arm, frag!, end) <= 1
		) {
			// One element bounds the arm itself. A root slot that produced it
			// inserts where the arm's content lands among the committed nodes.
			releaseFrontierSentinel(arm, frag!, end as Comment, before);
			arm.startMarker = content;
			arm.endMarker = content;
		} else {
			const start = document.createComment(marker);
			frag!.insertBefore(start, content);
			arm.startMarker = start;
			arm.exclusiveMarkers = true;
		}
	}
	if (fresh) {
		// The earlier arm of this render leaves the fragment; a pair stays.
		unmountBlock(old!, false);
		if (mark !== null && mark !== state.start)
			removeAfter(frag!, pairInFrag ? state.start : null, getNextSibling(mark));
	} else if (oldScope !== null) queueSlotDeletion(state, oldScope, first, last);
	if (owningBlock(parentBlock).disposed) return;
	state.block = arm;
	state.lite = null;
	state.branch = next;
	state.unfinalized = pending;
	if (paired) {
		if (suspended !== null) throw suspended;
		return;
	}
	// A markerless slot's content takes the committed root's place at commit,
	// and a sole-root ancestor that borrowed that root moves with it.
	let bound = state.next?.tx === transaction ? state.next.bound : null;
	if (!fresh && first !== null) {
		const pending = slotNext(state);
		pending.follows = true;
		if (sharesBlockBoundary(parentBlock, oldStart, oldEnd))
			bound = pending.bound = [parentBlock, oldStart, oldEnd, null, null];
	}
	if (pending) {
		state.end = null;
		state.anchor = before;
	} else if (arm !== null) {
		state.start = arm.startMarker === arm.endMarker ? null : (arm.startMarker as Comment);
		state.end = arm.endMarker;
	} else if (bound !== null) {
		// Empty output cannot bound itself: the ancestor moves to a pair.
		const pair = slotFrontier(state, parentBlock, domParent, before);
		const start = document.createComment(marker);
		const end = document.createComment('/' + marker);
		pair.append(start, end);
		state.start = start;
		state.end = end;
	} else {
		state.end = null;
		state.anchor = before;
	}
	if (bound !== null) {
		bound[3] = state.start ?? state.end;
		bound[4] = state.end;
	}
	if (suspended !== null) throw suspended;
}

/**
 * The end sentinel a frontier render last released (releaseFrontierSentinel).
 * Nothing names it once its root slots are retargeted, so the next render
 * reuses it rather than minting and collecting a comment per swap.
 */
let SPARE_SENTINEL: Comment | null = null;

/** Append an end sentinel to `frag`, reusing the spare one; its data is `data`. */
export function frontierSentinel(frag: DocumentFragment, data: string): Comment {
	let end = SPARE_SENTINEL;
	SPARE_SENTINEL = null;
	if (end === null) end = document.createComment(data);
	else end.data = data;
	frag.appendChild(end);
	return end;
}

/**
 * Retire a frontier sentinel once `scope` rendered before it: what still
 * anchors on it, at any depth, inserts before `before` instead, where the
 * content lands.
 */
export function releaseFrontierSentinel(
	scope: Scope,
	frag: DocumentFragment,
	end: Comment,
	before: Node | null,
): void {
	retargetPending(scope, end, before);
	frag.removeChild(end);
	SPARE_SENTINEL = end;
}

/**
 * A slot mounting for the first time under a committed Block, which an earlier
 * render did not carry this far (it suspended before reaching the slot),
 * builds off-document like any other new structure: in a frontier its commit
 * inserts before `anchor`, ending at a sentinel its root slots anchor to until
 * then (settleFreshSlot). Null when the parent's DOM is fresh.
 */
export function freshSlotEnd(
	parentBlock: Block,
	domParent: Node,
	anchor: Node | null | undefined,
): Comment | null {
	if (hydrating || !usesFrontier(parentBlock, domParent)) return null;
	return frontierSentinel(queueFrontier(parentBlock, domParent, anchor ?? null), '');
}

/** What anchored on a fresh slot's sentinel inserts where the slot lands. */
export function settleFreshSlot(
	parentScope: Scope,
	end: Comment,
	anchor: Node | null | undefined,
): void {
	const frag = end.parentNode;
	if (frag !== null)
		releaseFrontierSentinel(parentScope, frag as DocumentFragment, end, anchor ?? null);
}

/** Remove a fragment's fresh nodes after `after` (or from its start) up to `until`. */
export function removeAfter(frag: DocumentFragment, after: Node | null, until: Node | null): void {
	let node = after === null ? getFirstChild(frag) : getNextSibling(after);
	while (node !== null && node !== until) {
		const following = getNextSibling(node);
		frag.removeChild(node);
		node = following;
	}
}

/**
 * The shared branch-swap core. When `next` differs from the mounted branch:
 * when a transition or committed Suspense primary must preserve the old arm,
 * render `body` off-screen and COMMIT it in place (adopting the WIP markers —
 * see below); otherwise tear the old branch down and mount
 * `body` with the dynamic self-marking scheme. When it's the same branch,
 * re-render in place so hook state / event bindings survive. `marker` is the comment
 * label minted for the slot's boundary — `<!--if-->…<!--/if-->` /
 * `<!--switch-->…<!--/switch-->`, following the file-wide open/`/`close
 * convention (try//try, comp//comp, activity//activity, for//for).
 */
function renderBranchSlot(
	parentScope: Scope,
	slotKey: number,
	state: BranchSlot,
	domParent: Node,
	next: number,
	body: ComponentBody | null,
	marker: string,
	// Hoisted-helper env tuple (compiled-output Phase 2): the construct's
	// captured parent locals, refreshed by the compiled call site every parent
	// render. Stamped as `block.extra` on every branch block (and WIP) so
	// renderBlock forwards it as the body's third arg — a branch re-rendering
	// on its OWN reads the block's stored tuple (last parent render's values,
	// the same staleness a per-render closure had).
	env?: any[],
	// The compiler proved this arm hookless (ifBlock/switchBlock's lite mask).
	lite?: boolean,
	// The arm renders one template host (ifBlock's mask, switchBlock's roots).
	lone?: boolean,
): void {
	const parentBlock = parentScope.block;
	const hydration = hydrating ? CURSOR : null;
	if (next !== state.branch) {
		if (
			typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' &&
			__OCTANE_PROFILE_ENABLED__ &&
			state.branch !== -1
		)
			__profileArm(true);
		if (usesFrontier(parentBlock, domParent)) {
			swapBranchFrontier(parentScope, slotKey, state, domParent, next, body, marker, env, lone);
			return;
		}
		if (ROOT_RENDER_TRANSACTION !== null && (state.branch !== -1 || hydration !== null))
			journalRootSlot(state);
		let provisionalAfter: Node | null = null;
		if (state.unfinalized && state.block !== null) {
			// The first arm suspended before it could publish a stable boundary. Its
			// end marker is only the insertion anchor, so normal `.nextSibling`
			// positioning would mount a superseding arm after the following static
			// sibling. Tear down the aborted scope without range removal, then sweep
			// exactly its provisional range: only what a resumed leaf inserted inside
			// it, from its block's `startMarker` (pendingArmBefore). What precedes
			// that is its siblings' content, which may include a replacement staged
			// after the node that preceded the arm.
			const pending = state.block;
			provisionalAfter = pending.endMarker;
			let node = pending.startMarker ?? provisionalAfter;
			state.block = null;
			state.unfinalized = false;
			unmountBlock(pending, false);
			if (owningBlock(parentBlock).disposed) return;
			while (node !== null && node !== provisionalAfter) {
				const nextNode = getNextSibling(node);
				if (node.parentNode === domParent) domParent.removeChild(node);
				node = nextNode;
			}
		} else if (state.unfinalized && state.lite !== null) {
			// A lite arm never hydrates, so no resumed leaf left content to sweep.
			provisionalAfter = state.lite.block.endMarker;
			state.unfinalized = false;
			unmountLiteArm(state, false);
			if (owningBlock(parentBlock).disposed) return;
		}
		// A markerless branch may share its host boundary with a nested sole-root
		// branch. The nested branch updates Block markers when it replaces that
		// host, but this slot's cached `end` is intentionally not part of the Block
		// chain. Follow the live block boundary for positioning/probing so an outer
		// swap never inserts relative to a detached former root.
		const armBlock = state.block ?? state.lite?.block ?? null;
		const liveEnd =
			provisionalAfter === null &&
			state.start === null &&
			armBlock !== null &&
			armBlock.endMarker !== null
				? armBlock.endMarker
				: state.end;
		// Position for the new branch: just after the current branch's trailing node,
		// or the slot anchor on first mount. Captured BEFORE teardown (a self-marked
		// branch's trailing node is removed by it).
		const after: Node | null =
			provisionalAfter ?? (liveEnd !== null ? getNextSibling(liveEnd) : state.anchor);
		const oldBlockStart = armBlock?.startMarker ?? null;
		const oldBlockEnd = armBlock?.endMarker ?? null;
		const oldBoundaryShared = sharesBlockBoundary(parentBlock, oldBlockStart, oldBlockEnd);
		if (state.block) {
			unmountBlock(state.block);
			if (owningBlock(parentBlock).disposed) return;
			state.block = null;
		} else if (state.lite !== null) {
			unmountLiteArm(state, true);
			if (owningBlock(parentBlock).disposed) return;
		}
		state.branch = next;
		if (state.start === null && body !== null && oldBoundaryShared) {
			// A sole-root ancestor can borrow the outgoing branch's host as its
			// own boundary. Publish a durable replacement before rendering the
			// incoming arm: a nested Suspense may otherwise observe that removed
			// host and pass a detached insertion anchor to its try block.
			const s = document.createComment(marker);
			const e = document.createComment('/' + marker);
			domParent.insertBefore(s, after);
			domParent.insertBefore(e, after);
			state.start = s;
			state.end = e;
			replaceSharedBlockBoundary(parentBlock, oldBlockStart, oldBlockEnd, s, e);
		}
		if (state.start !== null) {
			// MARKER path — hydration-adopted, or already markered (multi-node / post-
			// swap). The branch borrows the slot's start/end (exclusiveMarkers teardown
			// keeps the markers). The server renders the arm directly inside the slot's
			// range (hydration-protocol.ts), and hydration adopts it there, but a
			// presentation-binding view's arm can have a range of its own.
			if (body) {
				let bStart: Node;
				let bEnd: Node;
				let borrowed = false;
				let rebuild = false;
				let inner: Comment | null = null;
				let innerEnd: Comment | null = null;
				let first: Node | null = null;
				const start = state.start as Comment;
				if (
					hydration !== null &&
					start.data.startsWith(BINDING_OPEN_PREFIX) &&
					hydration.isOpen(getNextSibling(start))
				) {
					inner = getNextSibling(state.start) as Comment;
					innerEnd = hydration.close(inner);
					if (innerEnd !== state.end && getNextSibling(innerEnd) !== state.end) {
						// The first nested pair does not SPAN the slot's adopted range, so it
						// cannot be this branch's own range: the server encoded this slot
						// differently, such as a value-hole list's outer pair with one pair
						// per item.
						hydration.failAt(
							parentScope,
							slotKey,
							'a single branch range',
							getNextSibling(innerEnd),
						);
					}
				}
				if (inner !== null) {
					bStart = inner;
					bEnd = innerEnd as Comment;
					hydration!.node = first = getNextSibling(inner);
				} else {
					bStart = state.start;
					bEnd = state.end as Node;
					borrowed = true;
					// Hydrating, the arm adopts the server's content from the slot's first
					// node (the close marker when the server rendered nothing). A pair this
					// hydration minted (a swap) holds client content only: build the branch
					// into it as client DOM.
					if (hydration !== null) {
						if (isBlockOpen(state.start)) hydration.node = first = getNextSibling(state.start);
						else rebuild = true;
					}
				}
				const b = createBlock(
					'control-flow',
					parentBlock,
					domParent,
					bStart,
					bEnd,
					body,
					undefined,
					env,
				);
				if (borrowed) b.exclusiveMarkers = true;
				state.block = b;
				if (rebuild) {
					// Suspend hydration for the whole branch subtree so cursor-greedy
					// adoption (e.g. a keyed list's markerless item path) client-builds
					// instead of claiming server nodes, then park the cursor after the slot
					// for the next sibling.
					hydration!.suspend(() => renderBlock(b));
					hydration!.node = getNextSibling(state.end as Node);
				} else if (first !== null) {
					hydration!.renderAdoptedArm(b);
					// The server may have rendered another arm here, longer than this one
					// or one this arm renders nothing of.
					hydration!.settle(bEnd, parentScope, slotKey);
				} else {
					renderBlock(b);
				}
			} else if (hydration !== null && getNextSibling(state.start) !== state.end) {
				// An empty client branch, but the server rendered content in this slot
				// (e.g. an `@else` with content on the server, an empty `@if` on the
				// client).
				hydration.failAt(parentScope, slotKey, END_OF_CONTENT, getNextSibling(state.start));
			}
		} else if (body) {
			// Markerless client mount — pick the boundary by what the branch renders.
			// This applies both on first mount and after an anchor-only empty arm:
			// a single host can self-mark without first manufacturing a pair. A
			// hydrating slot without a server range is borrowed (passthroughRanges):
			// its content adopts the server's from the cursor.
			let arm: Block;
			if (lite === true && liteArmAllowed(parentScope)) {
				// A hookless arm renders in a Scope of its own, without a Block. Its
				// stand-in starts with the bound an arm Block mounts with.
				const scope = new ScopeImpl(parentScope, parentBlock);
				arm = scope.block = new LiteBlockImpl(domParent, after, parentBlock) as unknown as Block;
				if (domParent.nodeType === 11) noteFrontierMember(domParent, scope);
				arm.startMarker = null;
				state.lite = scope;
				UNMOUNT_LITE_ARM ??= unmountLiteArm;
				renderMarkerlessArm(state, domParent, scope, marker, body, env);
			} else {
				arm = createBlock(
					'control-flow',
					parentBlock,
					domParent,
					null,
					after,
					body,
					undefined,
					env,
				);
				state.block = arm;
				renderMarkerlessArm(state, domParent, arm, marker);
			}
			replaceSharedBlockBoundary(
				parentBlock,
				oldBlockStart,
				oldBlockEnd,
				arm.startMarker,
				arm.endMarker,
			);
		} else if (!oldBoundaryShared) {
			// A truly empty client arm needs only its existing insertion anchor.
			// Keep the markerless regime so a later empty → single-host transition
			// can self-mark directly. Hydration never enters here: it adopted the
			// server's outer slot pair above.
			state.anchor = after;
			state.end = null;
		} else {
			// An enclosing sole-root block borrowed the old element. Empty output
			// cannot self-delimit, so promote both the slot and every exact borrower
			// to one shared pair rather than leaving an ancestor on a detached node.
			const s = document.createComment(marker);
			const e = document.createComment('/' + marker);
			domParent.insertBefore(s, after);
			domParent.insertBefore(e, after);
			state.start = s;
			state.end = e;
			replaceSharedBlockBoundary(parentBlock, oldBlockStart, oldBlockEnd, s, e);
		}
	} else if (state.block) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileArm(false);
		// Same branch — re-render in place with this render's env snapshot.
		if (state.block.body !== body) journalRootProperty(state.block, 'body', state.block.body);
		if (state.block.extra !== env) journalRootProperty(state.block, 'extra', state.block.extra);
		state.block.body = body!;
		state.block.extra = env;
		if (state.unfinalized) renderMarkerlessArm(state, domParent, state.block, marker);
		else renderBlock(state.block);
	} else if (state.lite !== null) {
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileArm(false);
		// Same lite arm. Its body and env arrive with every owner render.
		if (state.unfinalized) renderMarkerlessArm(state, domParent, state.lite, marker, body!, env);
		else renderLiteArm(state.lite, body!, env);
	}
	// Hydration consumed the whole outer control-flow slot, not only the active
	// branch nested inside it. Park the shared cursor after that outer range so a
	// following sibling @if/@switch adopts its own markers instead of seeing this
	// slot's close marker and mounting fresh DOM at the enclosing anchor.
	if (hydration !== null && !state.borrowed && state.end !== null) {
		hydration.parkPast(state.end, parentScope);
	}
}

interface IfSlot extends BranchSlot {
	__kind: 'ifBlockSlot';
	/** Insertion point for the FIRST branch (compiler position / null = append). */
	anchor: Node | null;
	/**
	 * Non-null once the slot uses comment markers: adopted server markers
	 * (hydration), or client markers minted for a multi-node / empty branch (or
	 * after a swap). Null while self-marking a single-element branch — then the
	 * element IS the boundary (block.startMarker === endMarker === it).
	 */
	start: Comment | null;
	/** Trailing node of the current branch: the self-marking element, the end
	 *  marker, or an empty placeholder — the position reference for the next swap. */
	end: Node | null;
	/** Current branch: 1 = then, 0 = else, -1 = uninitialized. */
	branch: number;
	block: Block | null;
}

export function ifBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	cond: boolean,
	thenBody: ComponentBody | null,
	elseBody: ComponentBody | null,
	anchor?: Node | null,
	// Hoisted-helper env tuple (compiled-output Phase 2) — see renderBranchSlot.
	env?: any[],
	// Arms the compiler proved hookless: 1 for then, 2 for else (renderBranchSlot);
	// 4 and 8 for each arm that renders one template host.
	lite?: number,
): void {
	// Evaluating this call's or an earlier slot's arguments can queue the
	// component's own update, and the render then replays. Leave the slot to the
	// replay, which keeps any previous branch and reaches every slot in source
	// order. A slot created now would adopt, when hydrating, the server range of
	// an earlier sibling that this pass skipped.
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	let state = parentScope.slots[slotKey] as IfSlot | undefined;
	if (
		slotKey === 0 &&
		parentScope !== RETURNED_OUTPUT_SCOPE &&
		(state as any)?.returnedOutput === true
	) {
		if (state!.__kind === 'ifBlockSlot') {
			setReturnedOutputOwner(state, false);
		} else {
			const block = parentScope.block;
			block.outputHandler!(block, null, true);
			if (block.disposed) return;
			state = undefined;
		}
	}
	if (state === undefined) {
		const hydration = hydrating ? CURSOR : null;
		let start: Comment | null = null;
		let end: Node | null = null;
		const passthrough = hydration?.passthroughRanges === true;
		// Hydration: adopt the server's `<!--[-->…<!--]-->` slot range (client mounts
		// defer marker creation entirely). `resolveHydrationOpen` also covers the
		// SOLE-hole case — a @if that is the only thing an enclosing arm/component
		// renders (e.g. `@try { @if (…) {…} }`, the router Match shape) — where the
		// anchor is the arm's END marker and the cursor is parked on the @if's open.
		const open = passthrough
			? null
			: (hydration?.branchOpen(anchor ?? null, domParent, parentScope, slotKey) ?? null);
		if (open !== null) {
			start = open;
			end = hydration!.close(open);
		}
		state = {
			__kind: 'ifBlockSlot',
			anchor: anchor ?? null,
			start,
			end,
			borrowed: passthrough,
			branch: -1,
			block: null,
			lite: null,
			unfinalized: false,
			next: null,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	const next: 0 | 1 = cond ? 1 : 0;
	renderBranchSlot(
		parentScope,
		slotKey,
		state,
		domParent,
		next,
		next ? thenBody : elseBody,
		'if',
		env,
		lite !== undefined && (lite & (next ? 1 : 2)) !== 0,
		lite !== undefined && (lite & (next ? 4 : 8)) !== 0,
	);
}

// ---------------------------------------------------------------------------
// Control flow: switchBlock — analogous to ifBlock but n-way
// ---------------------------------------------------------------------------
//
// The compiler lowers `@switch (d) { @case 1: { … } @default: { … } }` to a
// `switchBlock(scope, slotKey, host, discriminant, [[test0, body0], …],
// defaultBody)` call. Selection uses `===` against each case test in source
// order; the first hit wins, falling back to `defaultBody` when none match
// (`defaultBody` is `null` when the user wrote no `@default`).
//
// State machine mirrors `ifBlock` — both delegate to `renderBranchSlot` (see
// the branch-slots section above ifBlock): when the selected case index
// changes we tear down the previous branch Block and mount a fresh one; when
// the selected index is unchanged we re-render in place so hook state / event
// bindings survive. Index `-2` is reserved for the default branch, `-1` for
// uninitialized.
interface SwitchSlot extends BranchSlot {
	__kind: 'switchBlockSlot';
	/** Currently-mounted case index, or -1 if uninitialized / -2 for default.
	 *  All other fields as documented on IfSlot. */
	branch: number;
}

export function switchBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	discriminant: any,
	cases: ReadonlyArray<readonly [test: any, body: ComponentBody]>,
	defaultBody: ComponentBody | null,
	anchor?: Node | null,
	// Hoisted-helper env tuple (compiled-output Phase 2) — see renderBranchSlot.
	env?: any[],
	// Arms the compiler proved hookless: bit 0 for the default, bit i + 1 for case i.
	lite?: number,
	// Arms that render one template host, in the same bits.
	roots?: number,
): void {
	// Leave the slot to a pending replay, as ifBlock does.
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	let state = parentScope.slots[slotKey] as SwitchSlot | undefined;
	if (
		slotKey === 0 &&
		parentScope !== RETURNED_OUTPUT_SCOPE &&
		(state as any)?.returnedOutput === true
	) {
		if (state!.__kind === 'switchBlockSlot') {
			setReturnedOutputOwner(state, false);
		} else {
			const block = parentScope.block;
			block.outputHandler!(block, null, true);
			if (block.disposed) return;
			state = undefined;
		}
	}
	if (state === undefined) {
		const hydration = hydrating ? CURSOR : null;
		let start: Comment | null = null;
		let end: Node | null = null;
		const passthrough = hydration?.passthroughRanges === true;
		// Mirror ifBlock's sole-control-flow adoption: when @switch is the only
		// output of an enclosing component/arm, its compiler anchor is that owner's
		// END marker while the hydration cursor sits on the switch range's open.
		const open = passthrough
			? null
			: (hydration?.branchOpen(anchor ?? null, domParent, parentScope, slotKey) ?? null);
		if (open !== null) {
			start = open;
			end = hydration!.close(open);
		}
		state = {
			__kind: 'switchBlockSlot',
			anchor: anchor ?? null,
			start,
			end,
			borrowed: passthrough,
			branch: -1,
			block: null,
			lite: null,
			unfinalized: false,
			next: null,
		};
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
	}
	// Pick the first matching case, or fall back to default.
	let nextIdx = -2;
	let body: ComponentBody | null = defaultBody;
	for (let i = 0; i < cases.length; i++) {
		if (cases[i][0] === discriminant) {
			nextIdx = i;
			body = cases[i][1];
			break;
		}
	}
	renderBranchSlot(
		parentScope,
		slotKey,
		state,
		domParent,
		nextIdx,
		body,
		'switch',
		env,
		// Only the first 30 cases have lite bits, and a shift count wraps at 32.
		lite !== undefined && nextIdx < 30 && (lite & (nextIdx < 0 ? 1 : 2 << nextIdx)) !== 0,
		roots !== undefined && nextIdx < 30 && (roots & (nextIdx < 0 ? 1 : 2 << nextIdx)) !== 0,
	);
}
