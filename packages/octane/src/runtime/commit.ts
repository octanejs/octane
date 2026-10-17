// Commit functions and the binding journal
//
// Binding bags and their commit functions, slot `next` structures and
// frontiers, root ops lists, focus preservation across moves, and the journal
// that undoes a dropped render's binding writes.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './head.js';
import { hydrating, hydrationStarted } from '../hydration-flag.js';
import { __profileCount, ProfileCounter, __profileJournalRolledBack } from '../profiling.js';
import { formatClientError } from '../error-codes.client.generated.js';
import type { Scope, Block, RootRenderTransaction, SlotNext, SuspenseRefEntry } from './types.js';
import type { RefDetachSuppression, FragmentInstance } from './refs.js';
import {
	QUEUE,
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	retireRootBlock,
	placeRun,
	isCreatedInRootRender,
	undoCreatedInRootRender,
	renderingFocusMoves,
	retireEventHostTree,
} from './engine.js';
import { blockIsAncestorOf } from './effects.js';
import { CURSOR } from './hydration.js';
import {
	invalidateRender,
	LiteBlockImpl,
	unmountBlock,
	unmountSlot,
	releaseLiteArm,
} from './block.js';
import {
	CURRENT_SCOPE,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_BAGS,
	TRANSITION_JOURNAL_CHECKPOINT,
	TRANSITION_JOURNAL_BAG_WINDOW,
	TRANSITION_JOURNAL_DEPTH,
	OPS_CHECKPOINT,
	ROOT_RENDER_TRANSACTION,
	ROOT_DISCARD_STAMP,
} from './render.js';
import { owningBlock, replaceSharedBlockBoundary } from './branches.js';
import { forEachSubtreeChild } from './activity.js';
import { type ForSlot, moveBlockBefore } from './lists.js';
import { getFirstChild, getNextSibling } from './templates.js';
import { type HandlerBundle, EMPTY_ARGS, _dispatchDepth, CAPTURE_SLOTS } from './events.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// ─────────────────────────────────────────────────────────────────────────────
// Transition binding journal.
//
// Rendering and mutating happen in one walk, so a transition render patches a
// boundary's own bindings on the way down and only afterwards discovers that a
// descendant suspends. The boundary then holds its prior content, but those
// earlier patches have already landed — the boundary shows part of the new
// screen next to the old one. React renders the whole tree off the current one
// and commits in a single step, so its boundary stays whole.
//
// While a VISIBLE try body re-renders and a hold is possible, each binding write
// records what it replaced. If the body suspends and the boundary holds, the log
// is replayed backwards to the checkpoint taken when that body started, leaving
// the boundary exactly as it was. This all happens inside the flush that made
// the change, so nothing reached the screen in between: there is no visible
// rollback, only a boundary that never split.
//
// An explicit boundary replays its own checkpoint; writes outside that window
// remain unless the render folded queued hook work, which drops the whole root
// transaction (Transition holds). If no boundary owns the suspension, the root
// instead replays its whole queued render wave. These change-local journals
// preserve committed output and lifecycle; they are not a separate
// render/commit phase for every eager native host mutation.
//
// Compiled bindings guard on a cached copy of the last value (`if (_b.d !== _v)`)
// and never read the DOM, so restoring a node without restoring that cache would
// leave the guard convinced the node is already current and the value would
// never reappear. The first write into a bag therefore snapshots the whole bag
// next to the DOM entry.
//
// A form control's DOM (its live value, checkedness and selection, the default*
// mirrors, a radio group's other members) takes its writes at commit (#2043),
// so a dropped render never reached it. Only its projection record and bag are
// snapshotted, so a resumed render projects again.
// ─────────────────────────────────────────────────────────────────────────────

export const JOURNAL_BAG = 2;
export const JOURNAL_PROP = 3;
export const JOURNAL_CREATED = 4;
export const JOURNAL_RENDER = 5;
export const JOURNAL_UNDO = 6;
export const JOURNAL_INPUTS = 8;
export const JOURNAL_EVENT_OWNER = 9;
/** A nested window's start in its root's commit ops; replay drops what follows (dropRootOps). */
export const JOURNAL_OPS = 10;
export const TRANSITION_JOURNAL_WINDOWS: number[] = [];
export const TRANSITION_JOURNAL_BAG_WINDOWS: number[] = [];
/** Undo updates the prepared host projection without publishing rollback writes. */
let TRANSITION_JOURNAL_REPLAYING = false;

// ─────────────────────────────────────────────────────────────────────────────
// Commit functions (#2043 step 1).
//
// Render computes, commit writes. For each template the compiler hoists one
// commit function `C(bag, careful)`. The bag's binding slots hold COMMITTED
// values, the ones the DOM shows. A render compares each binding against its
// committed slot, inline in the compiled template, and only a difference calls
// a recorder. The first one stages the bag: `bag.next` becomes an array of
// pending cells, whose cells hold the bag itself as the "unchanged" marker
// until a binding records into them. `C` walks the cells straight-line: it
// writes each changed cell through the ordinary setter and only then publishes
// it to the committed slot.
//
// `bag.$` packs the template's cell count (low byte, the bag factory's
// argument) with the STAGED and QUEUED bits. An idle bag's `next` holds the
// template's commit function (the factory's last argument). A staged bag's
// cells carry three trailing ones: the rendering Scope (for commit-phase error
// routing), the index of the bag's entry in the root's ops, and `C`. The cells
// come from BAG_POOL while it has spares, and while it is short a queued commit
// returns them (commitRootRenders), so a newly mounted template's first update
// allocates nothing; a bag past the pool keeps its own array.
//
// A render that cannot be dropped calls `C` at once, from the template's
// trailing bagDone: a fresh Block the root attempt discards whole, a render
// with no open root transaction, and a hydrating render, whose adoption and
// mismatch checks live in the setters (on an adopted element they keep the
// server's value and write nothing). Every other render, urgent included,
// queues `(C, bag)` on `transaction.ops` as it stages, so a changed row costs
// its recorders and `C` alone. commitRootRenders runs the ops in render order
// before deletions, refs and effects. A dropped window truncates the ops back
// to its checkpoint and clears the dropped bags' state; their committed slots
// never moved, so nothing goes stale and memo bail-outs keep comparing against
// what the DOM shows.
//
// A bag staged earlier in the same transaction resumes its cells, so a later
// render must rewrite each one: the compiled template then records every
// binding (its `_r`), and an unchanged one writes the marker back.
// ─────────────────────────────────────────────────────────────────────────────
export const BAG_SIZE = 255;
const BAG_STAGED = 256;
const BAG_QUEUED = 512;
/** Eight spare cell arrays, seeded at load: see the section comment. */
export const BAG_POOL: any[][] = [[], [], [], [], [], [], [], []];
export const OPS_CHECKPOINTS: number[] = [];

/**
 * Record one binding the compiled template found changed, or any binding of a
 * resumed bag (the bag itself when it equals the committed value, so a later
 * render can revert a cell).
 *
 * A compiled handler bundle compares itself in the template and passes its
 * new callback, or the bag (unchanged) against the bag as its committed value,
 * then itself and its captures (or, for arity N, its argument array): a change
 * records the whole pending bundle, so the commit function tests its first cell
 * alone. A handler's signal authority refreshes in the template, through
 * setEventHandler, which this recorder never names: a template without
 * handlers does not retain it.
 */
export function bagRecord(
	s: Scope,
	next: any[] | null,
	cell: number,
	value: unknown,
	committed: unknown,
	bundle?: HandlerBundle,
	a0?: unknown,
	a1?: unknown,
): any[] | null {
	const bag = s.slots[0] as any;
	const changed = value !== committed;
	if (next === null) {
		// The render's first record stages the bag, inline: a changed row costs
		// its recorders and `C` alone.
		let state = bag.$;
		if (!changed && state <= BAG_SIZE) return null;
		const size = state & BAG_SIZE;
		if (state > BAG_SIZE) next = bagResume(bag);
		else {
			next = bag.next;
			if (typeof next === 'function') {
				// Kept packed: the commit function reads every cell. A longer pooled
				// array's extra cells go unread.
				const commit = next;
				next = bag.next = BAG_POOL.pop() ?? [];
				while (next.length < size + 3) next.push(bag);
				next[size + 2] = commit;
			}
			// A loop, not fill(): a builtin call costs more than a few cells.
			for (let i = size - 1; i >= 0; i--) next![i] = bag;
			bag.$ = state |= BAG_STAGED;
		}
		// A render that may be dropped queues `C` now, a resumed bag included;
		// one that cannot commits it from the template's trailing bagDone.
		const transaction = ROOT_RENDER_TRANSACTION;
		if (
			(state & BAG_QUEUED) === 0 &&
			transaction !== null &&
			!hydrating &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || s.block.createdStamp !== ROOT_DISCARD_STAMP)
		) {
			next![size] = s;
			next![size + 1] = transaction.ops.length;
			bag.$ = state | BAG_QUEUED;
			transaction.ops.push(next![size + 2], bag);
		}
	}
	next![cell] = changed ? value : bag;
	if (bundle !== undefined) {
		const args = bundle.args;
		if (args !== EMPTY_ARGS) next![cell + 1] = changed ? a0 : bag;
		if (args === 2 || args === -2) next![cell + 2] = changed ? a1 : bag;
	}
	return next;
}

/**
 * Resume a bag staged earlier in this transaction. A nested window that first
 * writes a bag queued by an outer window saves its cells, so dropping the
 * nested window restores the outer window's pending values.
 */
function bagResume(bag: any): any[] {
	const next = bag.next;
	if ((bag.$ & BAG_QUEUED) !== 0 && next[(bag.$ & BAG_SIZE) + 1] < OPS_CHECKPOINT)
		journalObjectOnce(next);
	return next;
}

/**
 * End of a template render whose records staged the bag without queueing it,
 * a render that cannot be dropped (bagRecord queues every other): commit now.
 * `careful` tells `C` to journal its handler writes for an open window and to
 * keep the snapshots a dispatch in flight holds (preserveDispatchedBundle);
 * commitRootRenders passes it too.
 */
export function bagDone(s: Scope, bag: any, commit: (bag: any, careful: boolean) => void): void {
	bag.next[bag.$ & BAG_SIZE] = s;
	commit(bag, TRANSITION_JOURNAL !== null || (_dispatchDepth !== 0 && CAPTURE_SLOTS.length !== 0));
}

/** The open root render's pending structure for `slot`, queued for its commit. */
export function slotNext(slot: { next: SlotNext | null }): SlotNext {
	const tx = ROOT_RENDER_TRANSACTION!;
	let next = slot.next;
	if (next === null || next.tx !== tx) {
		next = slot.next = {
			tx,
			out: [],
			frag: null,
			root: null,
			parent: null,
			before: null,
			members: null,
			owner: null,
			follows: false,
			bound: null,
		};
		tx.ops.push(applySlotNext, slot);
		// A window that drops truncates what it created; only a structure an
		// outer window built needs copying back (below).
		if (TRANSITION_JOURNAL_DEPTH > 1)
			TRANSITION_JOURNAL_BAGS!.set(next, TRANSITION_JOURNAL!.length);
	} else if (
		TRANSITION_JOURNAL_DEPTH > 1 &&
		(TRANSITION_JOURNAL_BAGS!.get(next) ?? -1) < TRANSITION_JOURNAL_CHECKPOINT
	) {
		// An outer window changed this slot already. A nested window that drops
		// must give its pending structure back: copy it on first touch, as a
		// bag's cells are.
		journalObjectOnce(next);
		journalObjectOnce(next.out);
		if (next.members !== null) journalObjectOnce(next.members);
		if (next.bound !== null) journalObjectOnce(next.bound);
	}
	return next;
}

/**
 * The fragment a slot builds its incoming content in during a root render
 * that changes committed structure. Fresh descendants write straight into it;
 * its commit inserts it into `parent` before `before`, after the slot's
 * deletions, and rehomes what was created directly in it. A later swap in the
 * same render reuses it and its insertion point.
 */
export function slotFrontier(
	slot: { next: SlotNext | null },
	owner: Block,
	parent: Node,
	before: Node | null,
): DocumentFragment {
	const next = slotNext(slot);
	if (next.frag === null) openFrontier(next, owner, parent, before);
	return next.frag!;
}

/**
 * A frontier of its own, for content that lands where no slot existed before
 * this render: a new return slot, or a root's mount (whose root Block, created
 * after the fragment, becomes its owner).
 */
export function queueFrontier(
	owner: Block | null,
	parent: Node,
	before: Node | null,
): DocumentFragment {
	const tx = ROOT_RENDER_TRANSACTION!;
	const next: SlotNext = {
		tx,
		out: [],
		frag: null,
		root: null,
		parent: null,
		before: null,
		members: null,
		owner: null,
		follows: false,
		bound: null,
	};
	tx.ops.push(applySlotNext, { next });
	return openFrontier(next, owner, parent, before);
}

/** A detached arm root's members: none, and nothing adds any (it has no fragment). */
export const NO_MEMBERS: any[] = [];

/** Committed frontiers, empty again: the next renders reuse them (applySlotNext). */
const SPARE_FRONTIERS: DocumentFragment[] = [];

function openFrontier(
	next: SlotNext,
	owner: Block | null,
	parent: Node,
	before: Node | null,
): DocumentFragment {
	// A container in another document, such as a document root's, builds in a
	// fragment of that document.
	const doc = parent.nodeType === 9 ? (parent as Document) : parent.ownerDocument!;
	const spare = SPARE_FRONTIERS.pop();
	const frag =
		spare !== undefined && spare.ownerDocument === doc ? spare : doc.createDocumentFragment();
	(frag as any).$$next = next;
	next.frag = frag;
	next.members = [];
	next.parent = parent;
	next.before = before;
	next.owner = owner === null ? null : owningBlock(owner);
	return frag;
}

/**
 * Record what a frontier fragment's commit rehomes: anything created with it
 * as its parent, paired with that fragment (a list's runs each have their own).
 */
export function noteFrontierMember(parent: Node, member: object): void {
	const next: SlotNext | undefined = (parent as any).$$next;
	if (next !== undefined) next.members!.push(member, parent);
}

/**
 * Whether a slot of `parentBlock` that changes structure in the open root
 * render writes through a frontier: its owner's DOM is live. Hydration that is
 * adopting server DOM records that structure instead.
 */
export function usesFrontier(parentBlock: Block, domParent: Node): boolean {
	const transaction = ROOT_RENDER_TRANSACTION;
	if (
		transaction === null ||
		transaction.aborted ||
		ROOT_RENDER_ROLLBACK ||
		(hydrating && CURSOR !== null)
	)
		return false;
	// A Block this render created writes fresh DOM, unless it adopted live DOM.
	const owner = parentBlock instanceof LiteBlockImpl ? parentBlock.ownerBlock : parentBlock;
	if (owner.createdStamp === transaction.createdStamp && !transaction.retainedCreated?.has(owner)) {
		if (!hydrationStarted) return false;
		// A root's hydrating attempt creates every Block, and the server DOM they
		// adopted stays untouched until it commits. What a slot builds on the
		// client over that DOM goes through a frontier too, as it does in a
		// boundary's hydration attempt in a later render.
		if (transaction.hydrating !== true) return hydrating && domParent.isConnected;
		const container = transaction.owner.current?.parentNode;
		return (container != null && container.contains(domParent)) || domParent.isConnected;
	}
	// A committed Block can still render a slot into fresh DOM, as can a lite
	// Scope this render created under one: a frontier, which commit inserts.
	if (domParent.isConnected) return true;
	let node = domParent;
	for (let parent = node.parentNode; parent !== null; parent = node.parentNode) node = parent;
	return node.nodeType !== 11 || (node as any).$$next === undefined;
}

/** Retire a committed Block or lite arm and queue its range's deletion on `slot`. */
export function queueSlotDeletion(
	slot: { next: SlotNext | null },
	owner: Scope,
	first: Node | null,
	last: Node | null,
): void {
	retireRootBlock(owner.block);
	slotNext(slot).out.push(owner, first, last);
}

/**
 * Apply a slot's pending structure: its deletions, then its frontier insert,
 * then rehome what was created in the fragment onto the live parent.
 */
export function applySlotNext(slot: { next: SlotNext | null }): void {
	const next = slot.next;
	slot.next = null;
	if (next === null) return;
	const out = next.out;
	const parent = next.parent!;
	let before = next.before;
	if (next.follows && out.length !== 0) {
		const first: Node | null = out[out.length - 2];
		if (first !== null && first.parentNode === parent) before = getNextSibling(out[out.length - 1]);
	}
	applyOutgoing(out, parent);
	const members = next.members;
	// A deletion cleanup can unmount the slot's owner before its content lands.
	if (members === null || next.owner!.disposed) return;
	const frag = next.frag;
	// A branch arm's detached root lands alone, with no members to rehome.
	if (frag !== null || next.root !== null) parent.insertBefore(frag ?? next.root!, before);
	for (let i = 0; i < members.length; i += 2) {
		const member = members[i];
		const from = members[i + 1];
		if (member.__kind !== undefined) {
			rehomeSlot(member, from, parent);
			continue;
		}
		// A Block or a lite Scope's stand-in, and the binding-bag fields its body
		// cached from the fragment. A lone root node has no root-level hole to
		// cache its parent for. Inline: a fresh run rehomes one Block per row.
		const block = member.block;
		if (block.parentNode === from) block.parentNode = parent;
		const bag = member.slots[0];
		if (
			bag != null &&
			bag[BINDING_BAG_ARITY] !== undefined &&
			(block.startMarker === null || block.startMarker !== block.endMarker)
		)
			for (const key in bag) if (bag[key] === from) bag[key] = parent;
	}
	const bound = next.bound;
	if (bound !== null) replaceSharedBlockBoundary(bound[0], bound[1], bound[2], bound[3], bound[4]);
	if (process.env.NODE_ENV !== 'production')
		for (let i = 0; i < members.length; i += 2) assertRehomed(members[i], members[i + 1]);
	if (frag === null) return;
	(frag as any).$$next = undefined;
	// Nothing names a committed frontier any more (assertRehomed).
	if (
		SPARE_FRONTIERS.length < 64 &&
		getFirstChild(frag) === null &&
		frag.ownerDocument === document
	)
		SPARE_FRONTIERS.push(frag);
}

/** Point a try, error or portal slot created directly in a committed frontier at its live parent. */
function rehomeSlot(member: any, frag: DocumentFragment, parent: Node): void {
	if (member.__kind !== 'portalSlotSlot') {
		if (member.domParent === frag) member.domParent = parent;
		return;
	}
	// Its content bubbles to its logical parent, stamped as it rendered.
	if (member.host !== frag) return;
	member.host = parent;
	for (let n = getNextSibling(member.start); n !== null && n !== member.end; n = getNextSibling(n))
		if ((n as any).$$portalParent === frag) (n as any).$$portalParent = parent;
}

/** Development check: nothing below a committed frontier still names its fragment. */
function assertRehomed(scope: any, frag: DocumentFragment): void {
	if (
		scope.__kind === 'trySlotSlot' ||
		scope.__kind === 'errorSlotSlot' ||
		scope.__kind === 'portalSlotSlot'
	) {
		if (scope.domParent === frag || scope.host === frag)
			throw new Error(formatClientError(349, 'a slot'));
		return;
	}
	if (scope.block.parentNode === frag) throw new Error(formatClientError(349, 'a Block'));
	const bag = scope.slots[0];
	if (bag != null && bag[BINDING_BAG_ARITY] !== undefined)
		for (const key in bag)
			if (bag[key] === frag) throw new Error(formatClientError(349, 'a binding bag'));
	const slots: any[] | null = scope._slots;
	if (slots !== null)
		for (let i = 0; i < slots.length; i++)
			if (slots[i].domParent === frag) throw new Error(formatClientError(349, 'a try slot'));
	if (scope.block.disposed !== true)
		forEachSubtreeChild(scope, (child) => assertRehomed(child, frag));
}

/**
 * Markers a hydrating render minted over the server DOM it adopts, which its
 * commit places, each before the node it names (placeAtCommit). A render that
 * never commits leaves the server DOM without them.
 */
let PENDING_MARKERS: WeakMap<Node, [parent: Node, before: Node | null]> | null = null;

/**
 * Put `node`, a marker a hydrating render minted, before `before` in `parent`
 * at commit. A later call before the commit moves it.
 */
export function placeAtCommit(parent: Node, node: Node, before: Node | null): void {
	if (ROOT_RENDER_TRANSACTION === null) {
		parent.insertBefore(node, before);
		return;
	}
	const pending = (PENDING_MARKERS ??= new WeakMap());
	const queued = pending.has(node);
	pending.set(node, [parent, before]);
	if (!queued) ROOT_RENDER_TRANSACTION.ops.push(placeMarker, node);
}

function placeMarker(node: Node): void {
	const placement = PENDING_MARKERS?.get(node);
	if (placement === undefined) return;
	const [parent, before] = placement;
	PENDING_MARKERS!.delete(node);
	// A marker it goes before that is still to be placed lands first.
	if (before !== null && PENDING_MARKERS!.has(before)) placeMarker(before);
	parent.insertBefore(node, before);
}

/** Whether `node` is a marker still to be placed (placeAtCommit). */
export function markerPending(node: Node): boolean {
	return PENDING_MARKERS !== null && node.parentNode === null && PENDING_MARKERS.has(node);
}

/**
 * Where `node` stands in the server DOM: itself, or for a marker still to be
 * placed, the node it goes before, past any other such marker.
 */
export function markerPosition(node: Node | null): Node | null {
	while (node !== null && markerPending(node)) node = PENDING_MARKERS!.get(node)![1];
	return node;
}

/** The parent `node` is in, or for a marker still to be placed, the one it lands in. */
export function markerParent(node: Node): Node | null {
	return node.parentNode ?? PENDING_MARKERS?.get(node)?.[0] ?? null;
}

/** Take `node`, a marker a hydrating render minted, out: before its commit places it, or now. */
export function discardMarker(node: Node): void {
	if (markerPending(node)) PENDING_MARKERS!.delete(node);
	else (node as ChildNode).remove();
}

/** The node after `node` in the server DOM, for a marker still to be placed too (markerPosition). */
export function nodeAfter(node: Node): Node | null {
	return markerPending(node) ? markerPosition(node) : getNextSibling(node);
}

/** Run `fn(arg)` at the open root render's commit, or now outside one. */
export function atCommit<T>(fn: (arg: T) => void, arg: T): void {
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction === null) fn(arg);
	else transaction.ops.push(fn, arg);
}

/**
 * Put a Text that hydration created for a server's empty text into adopted
 * DOM: before `before` in `parent`, in its place when `replaces` (an empty-text
 * stand-in). Its commit does it, so a dropped attempt leaves the server DOM.
 */
export function placeHydratedText([parent, node, before, replaces]: [
	Node,
	Text,
	Node | null,
	boolean,
]): void {
	if (before !== null && before.parentNode !== parent) return;
	parent.insertBefore(node, before);
	if (replaces) parent.removeChild(before!);
}

/** Queue outgoing content no slot record owns: one `out` entry of its own. */
export function queueRootDeletion(owner: unknown, first: Node | null, last: Node | null): void {
	ROOT_RENDER_TRANSACTION!.ops.push(applyOutgoing, [owner, first, last]);
}

/**
 * Delete outgoing content at commit, in React's commitDeletionEffects order.
 * Each range's hosts retire first, so no cleanup can move focus off them while
 * they still dispatch. Its owner's cleanups then run against connected DOM, and
 * only then do the nodes leave. The range is read here, at commit, not in render.
 *
 * A list's log (listNext) also holds its moves and its fresh runs, in render
 * order, so each lands against the DOM the render saw: a survivor moves before
 * its anchor, and a run's fragment goes into `parent` before its anchor.
 */
export function applyOutgoing(out: any[], parent?: Node): void {
	for (let i = 0; i < out.length; i += 3) {
		const kind = out[i];
		if (kind === placeRoots || kind === moveBlockBefore || kind === placeRun) {
			// A deletion cleanup can unmount the list before the rest of its log.
			const anchor: Node = out[i + 2];
			if (anchor.parentNode === parent) {
				if (kind === placeRoots) placeRoots(parent!, out[i + 1], anchor);
				else if (kind === placeRun) placeRun(parent!, out[i + 1], anchor);
				else if (!out[i + 1].disposed) moveBlockBefore(out[i + 1], anchor);
			}
			continue;
		}
		const first: Node | null = out[i + 1];
		const last: Node | null = out[i + 2];
		const host = first === null ? null : first.parentNode;
		if (first === last && host !== null) {
			// A self-marked root: one node, no range to collect.
			retireEventHostTree(first!);
			if (kind !== null) releaseOutgoing(kind);
			if (first!.parentNode === host) host.removeChild(first!);
			continue;
		}
		const nodes: Node[] = [];
		if (host !== null) {
			for (let node: Node | null = first; node !== null; node = getNextSibling(node)) {
				nodes.push(node);
				if (node === last) break;
			}
		}
		for (let j = 0; j < nodes.length; j++) retireEventHostTree(nodes[j]);
		if (kind !== null) releaseOutgoing(kind);
		for (let j = 0; j < nodes.length; j++) {
			const node = nodes[j];
			if (node.parentNode === host) host!.removeChild(node);
		}
	}
}

/** Run an outgoing owner's deletion cleanups: a Block's, a lite arm's, a slot's, or a callback. */
function releaseOutgoing(owner: any): void {
	if (typeof owner === 'function') owner();
	else if (owner.__kind !== undefined) unmountSlot(owner, false);
	else if (owner.block === owner) unmountBlock(owner, false);
	else releaseLiteArm(owner);
}

/**
 * Drop the commit work a render queued from `from` on, and the deletions it
 * retired past the first `retired`. Nothing it deleted has left the DOM, so a
 * dropped render restores no nodes.
 */
export function dropRootOps(
	transaction: RootRenderTransaction,
	from: number,
	retired: number,
): void {
	const ops = transaction.ops;
	for (let i = from; i < ops.length; i += 2) {
		const target = ops[i + 1];
		// A bag keeps its committed values; a slot drops its pending structure.
		if (ops[i] === applySlotNext) target.next = null;
		else if (typeof target?.$ === 'number') target.$ &= BAG_SIZE;
	}
	ops.length = from;
	const set = transaction.retired;
	if (set !== null && set.size > retired) {
		let i = 0;
		for (const block of set) if (i++ >= retired) set.delete(block);
	}
}

/**
 * Whether a root render leaves `block`'s teardown to its commit: a committed
 * Block the render removed from its tree. The range stays connected and
 * untouched until then, so deletion cleanups observe connected DOM and a
 * dropped render restores nothing. A Block whose first render suspended (a
 * hidden primary that never resolved) has never mounted, but an earlier commit
 * still inserted its range.
 */
export function defersRootUnmount(block: Block): boolean {
	const transaction = ROOT_RENDER_TRANSACTION;
	return (
		transaction !== null &&
		!transaction.aborted &&
		!ROOT_RENDER_ROLLBACK &&
		block.idState.renderOwner === transaction.owner &&
		!isCreatedInRootRender(transaction, block)
	);
}

/**
 * Queue a committed subtree's teardown for its root's commit. `scope` is a
 * Block, or a lite arm's Scope whose stand-in carries the range; a stand-in
 * reads as neither a root nor disposed. An `exclusive` range keeps its pair.
 */
export function queueRootUnmount(scope: Scope, exclusive: boolean, out?: any[]): void {
	const block = scope.block;
	retireRootBlock(block);
	const start = block.startMarker;
	const end = block.endMarker;
	let first: Node | null = null;
	let last: Node | null = null;
	if (start !== null && end !== null && start.parentNode !== null) {
		if (!exclusive) {
			first = start;
			last = end;
		} else if (getNextSibling(start) !== end) {
			first = getNextSibling(start);
			last = end.previousSibling;
		}
	} else if (block.kind === 'root') {
		const parent = block.parentNode;
		first = getFirstChild(parent);
		// A document keeps its doctype (clearRootContainer).
		if (first !== null && first.nodeType === 10) first = getNextSibling(first);
		last = parent.lastChild;
	}
	// A teardown inside an aborted mount keeps that mount's ref suppression.
	const suppressed = REF_DETACH_SUPPRESSION;
	const owner =
		suppressed === null
			? scope
			: () => {
					const previous = REF_DETACH_SUPPRESSION;
					REF_DETACH_SUPPRESSION = suppressed;
					try {
						releaseOutgoing(scope);
					} finally {
						REF_DETACH_SUPPRESSION = previous;
					}
				};
	if (out === undefined) queueRootDeletion(owner, first, last);
	else {
		// A list row (or @empty) whose deletion waits for the list's commit.
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
			__profileCount(ProfileCounter.ROW_PARK);
		out.push(owner, first, last);
	}
}

/**
 * A keyed list's pending structure in the open root render, or null when the
 * list writes its DOM as it renders: outside a root render, for a fresh list,
 * or while hydration adopts server rows. Its `out` is a log of the rows' DOM
 * work in render order (row deletions, survivor moves, and fresh runs, each a
 * fragment of rows that lands before one anchor), replayed by its commit
 * entry. The entry takes `at`, where the reconcile began in the commit queue,
 * so the list's deletions run before its survivors' value commits.
 */
export function listNext(state: ForSlot, parentBlock: Block, at: number): SlotNext | null {
	const tx = ROOT_RENDER_TRANSACTION;
	if (tx === null) return null;
	if (state.next !== null && state.next.tx === tx) return slotNext(state);
	// A hydrating list's end may still be to place (placeAtCommit): only then
	// is it parentless, so an ordinary list update makes no extra call.
	const parent = state.end.parentNode ?? markerParent(state.end)!;
	if (state.adopt !== null || !usesFrontier(parentBlock, parent)) return null;
	const owner = parentBlock instanceof LiteBlockImpl ? parentBlock.ownerBlock : parentBlock;
	// Its members list starts with its first run (listRun).
	const next: SlotNext = (state.next = {
		tx,
		out: [],
		frag: null,
		root: null,
		parent,
		before: null,
		members: null,
		owner,
		follows: false,
		bound: null,
	});
	const ops = tx.ops;
	if (at >= ops.length) ops.push(applySlotNext, state);
	else ops.splice(at, 0, applySlotNext, state);
	if (TRANSITION_JOURNAL_DEPTH > 1) TRANSITION_JOURNAL_BAGS!.set(next, TRANSITION_JOURNAL!.length);
	return next;
}

/**
 * The end marker of a fresh single-root row in a committed list. commitBag
 * leaves such a row's root detached and self-marks the row with it, so the
 * row needs no container and no rehoming: its commit inserts the root alone,
 * as React places a new row (placeRoots).
 */
export let DETACHED_ROOT: Comment | null = null;

export function newDetachedRoot(): Comment {
	return (DETACHED_ROOT = document.createComment(''));
}

/** The rows whose detached roots land before `anchor`: the log's last batch, or a new one. */
export function listRoots(next: SlotNext, anchor: Node): Block[] {
	const out = next.out;
	const n = out.length;
	if (n !== 0 && out[n - 3] === placeRoots && out[n - 1] === anchor) return out[n - 2];
	const rows: Block[] = [];
	out.push(placeRoots, rows, anchor);
	return rows;
}

export function placeRoots(parent: Node, rows: Block[], anchor: Node): void {
	const into = parent;
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (!row.disposed) into.insertBefore(row.startMarker!, anchor);
	}
}

/** The fragment fresh rows that land before `anchor` render into: the log's last run, or a new one. */
export function listRun(next: SlotNext, anchor: Node): DocumentFragment {
	const out = next.out;
	const n = out.length;
	if (n !== 0 && out[n - 3] === placeRun && out[n - 1] === anchor) return out[n - 2];
	const frag = document.createDocumentFragment();
	(frag as any).$$next = next;
	next.members ??= [];
	out.push(placeRun, frag, anchor);
	return frag;
}

/**
 * Snapshot the rendering scope's binding bag the first time it is written in the
 * open window. Called from the binding helpers, which the compiler always emits
 * BEFORE the matching `_b.x = _v`, so the captured values are the pre-render
 * ones.
 *
 * Slot 0 only holds a bag when the body has a template root; a body made purely
 * of control flow puts its first block slot there instead (`tryBlock(__s, 0, …)`).
 * Fixed-arity bags have a private brand. The spill bagOf path retains the
 * `__kind` test so user-supplied keys cannot impersonate a runtime slot or a
 * fixed bag; restoring a boundary's own state as a bag would corrupt its hold.
 */
export const BINDING_BAG_ARITY = Symbol();
// Keep one spread site per arity for monomorphic cloning, without an extra call.
// Downstream minifiers may merge these sites; the optimization requires separate sites.
// Spread preserves enumerable string and symbol values; rollback removes additions.

function cloneBindingBag(bag: any, arity: number): object {
	switch (arity) {
		case 0:
			return { ...bag };
		case 1:
			return { ...bag };
		case 2:
			return { ...bag };
		case 3:
			return { ...bag };
		case 4:
			return { ...bag };
		case 5:
			return { ...bag };
		case 6:
			return { ...bag };
		case 7:
			return { ...bag };
		case 8:
			return { ...bag };
		case 9:
			return { ...bag };
		case 10:
			return { ...bag };
		case 11:
			return { ...bag };
		case 12:
			return { ...bag };
		case 13:
			return { ...bag };
		case 14:
			return { ...bag };
		case 15:
			return { ...bag };
		case 16:
			return { ...bag };
		default:
			return { ...bag };
	}
}

export function journalBag(): void {
	const scope = CURRENT_SCOPE;
	if (scope === null) return;
	// The root log discards a Block created in this transaction wholesale, even
	// if it completed an earlier render in the same wave. Keep nested boundary
	// windows and adopted DOM on the ordinary snapshot path: they can restore
	// their content without discarding this scope.
	if (TRANSITION_JOURNAL_DEPTH === 1 && scope.block.createdStamp === ROOT_DISCARD_STAMP) return;
	const bag = scope.slots[0];
	if (bag === null || typeof bag !== 'object') return;
	const arity = (bag as any)[BINDING_BAG_ARITY];
	if (arity !== undefined) {
		const window = TRANSITION_JOURNAL_BAG_WINDOW;
		if (bag.__journalWindow === window) return;
		const snapshot = cloneBindingBag(bag, arity);
		TRANSITION_JOURNAL!.push(JOURNAL_BAG, bag, snapshot, null);
		bag.__journalWindow = window;
		return;
	}
	// The spill bagOf path and runtime slots retain the generic, exact snapshot.
	if ((bag as any).__kind !== undefined) return;
	journalObjectOnce(bag);
}

/** Record every own value of `obj`, once per window, so it can be put back. */
export function journalObjectOnce(obj: object): void {
	const seen = TRANSITION_JOURNAL_BAGS!;
	if ((seen.get(obj) ?? -1) >= TRANSITION_JOURNAL_CHECKPOINT) return;
	seen.set(obj, TRANSITION_JOURNAL!.length);
	// These are runtime-owned records. Copy once on the ordinary write path;
	// enumerating keys and removing speculative additions belongs to rollback.
	// Event argument arrays also need their non-enumerable length restored.
	TRANSITION_JOURNAL!.push(JOURNAL_BAG, obj, { ...obj }, Array.isArray(obj) ? obj.length : null);
}

/**
 * A keyed list's rollback record for one journal window. The full form copies
 * the chain, and the key Map's order where it differs, before a reconcile
 * relinks rows wholesale. The link form serves the shapes that relink a bounded
 * set of rows (inserts, removals, a small displacement): it keeps the old head
 * and the old `nextSibling` of each row whose `nextSibling` it rewrites, and
 * rollback walks the old chain forward through those links (fullForSlotRecord).
 * Restoring the chain rewrites every `prevSibling` and index from position, so
 * neither form records those. A wholesale change later in the same window, or
 * a record for an inner window, converts the link form to the full form first.
 *
 * A link record gets its `links` Map at its first relink. Until then only index
 * writes have run, and they change neither the chain nor the key Map, so
 * converting it copies the list as it stands, as the full form would have when
 * the record was taken. A reorder that falls through to the LIS path therefore
 * pays exactly the full form's copy.
 *
 * The record rides in the spare slot of its own undo entry, where `seen` (the
 * window's bag index) finds it again, so it lives exactly as long as its log:
 * a removed row it references goes when the committed log is dropped.
 */
export interface ForSlotRecord {
	empty: Block | null;
	/** The chain when the record was taken; null while it is in the link form. */
	chain: Block[] | null;
	mapOrder: Block[] | null;
	head: Block | null;
	/** Link form: each relinked row's old `nextSibling`, from the first relink on. */
	links: Map<Block, Block | null> | null;
	/** `state.inOrder` when the record was taken. */
	inOrder: boolean;
	/** The Map's order before a link-form removal, when not chain order. */
	prior: Block[] | null;
	/** Development only: the full form, checked against the link form. */
	check?: Block[][];
}

/**
 * Record a keyed list's shape before a reconcile that may have to be undone.
 *
 * The list is restored as a whole rather than per operation: the chain, the key
 * map and the counts all move together, and rebuilding the DOM from the restored
 * chain puts moved survivors back as well as dropped rows. Once per list per
 * window — the first record is the pre-render one, which is the one to go back
 * to.
 *
 * Without `link`, the caller is about to relink rows wholesale, so the record
 * takes, or converts to, the full form. With `link`, the window's record comes
 * back, and a caller that relinks rows records the old `nextSibling` of each
 * row it rewrites in `forSlotLinks(record)` first (a full record needs none).
 * Null when hydration adoption journals the range instead. One call either
 * way, like the single snapshot function this replaces.
 */
export function journalForSlot(state: ForSlot, link?: boolean): ForSlotRecord | null {
	const seen = TRANSITION_JOURNAL_BAGS!;
	const at = seen.get(state) ?? -1;
	// The record rides in the spare slot of the list's undo entry; an entry without
	// one (hydration adoption, an owned-list clear) holds null there.
	const current: ForSlotRecord | null =
		at >= 0 && TRANSITION_JOURNAL![at] === JOURNAL_UNDO ? TRANSITION_JOURNAL![at + 2] : null;
	if (link && at >= TRANSITION_JOURNAL_CHECKPOINT) return current;
	// A wholesale change converts this window's link record; an inner window's
	// record stops an enclosing window's link record gathering links.
	if (current !== null) fullForSlotRecord(state, current);
	if (at >= TRANSITION_JOURNAL_CHECKPOINT) return null;
	seen.set(state, TRANSITION_JOURNAL!.length);
	if (
		ROOT_RENDER_TRANSACTION !== null &&
		((ROOT_RENDER_TRANSACTION.hydrating === true && hydrating && CURSOR !== null) ||
			state.adopt !== null)
	) {
		// The initial chain is empty even though its DOM is already owned: server
		// nodes or raw hosts being upgraded to Blocks. A failed adoption discards
		// fresh scopes, not those hosts, while restoring the original range.
		journalUndo(() => {
			seen.delete(state);
		});
		// No chain record restores indices here, so rows that already exist keep
		// theirs individually before reconcileKeyed moves them.
		for (let b: Block | null = state.head; b !== null; b = b.nextSibling)
			TRANSITION_JOURNAL!.push(JOURNAL_PROP, b, 'itemIndex', b.itemIndex);
		return null;
	}
	const record: ForSlotRecord = {
		empty: state.emptyBlock,
		chain: null,
		mapOrder: null,
		head: state.head,
		links: null,
		inOrder: state.inOrder,
		prior: null,
	};
	if (!link) fullForSlotRecord(state, record);
	else if (process.env.NODE_ENV !== 'production') record.check = forSlotShape(state);
	TRANSITION_JOURNAL!.push(
		JOURNAL_UNDO,
		() => {
			fullForSlotRecord(state, record);
			restoreForSlot(state, record, record.chain);
			seen.delete(state);
		},
		record,
		null,
	);
	return link ? record : null;
}

/**
 * Where a link-form relink records old `nextSibling`s; null without a record or
 * for a full one. The first relink allocates it even when it records nothing (a
 * head insert or removal), because from then on the list is no longer the
 * recorded one.
 */
export function forSlotLinks(record: ForSlotRecord | null): Map<Block, Block | null> | null {
	return record !== null && record.chain === null ? (record.links ??= new Map()) : null;
}

/** Development check: the chain, and the Map's order where it differs. */
function forSlotShape(state: ForSlot): Block[][] {
	const chain: Block[] = [];
	for (let b: Block | null = state.head; b !== null; b = b.nextSibling) chain.push(b);
	const keyOrder = [...state.items.values()];
	return keyOrder.length === chain.length && keyOrder.every((block, i) => block === chain[i])
		? [chain]
		: [chain, keyOrder];
}

/**
 * Convert a link record to the full form: the shape when it was taken. A new
 * full record, and a link record nothing has relinked yet, copy the list as it
 * stands. A full record, or none, is left as it is.
 */
function fullForSlotRecord(state: ForSlot, record: ForSlotRecord | null): void {
	if (record === null || record.chain !== null) return;
	const links = record.links;
	record.links = null;
	if (links === null) {
		const chain: Block[] = [];
		for (let b: Block | null = state.head; b !== null; b = b.nextSibling) chain.push(b);
		record.chain = chain;
		// The key Map keeps insertion order through earlier reorders. Preserve that
		// order for context refresh only when it differs from the linked DOM order.
		// Spreading the values takes the engine's bulk copy; a list reordered before
		// differs at its first rows, so the comparison usually stops at once.
		const keyOrder = [...state.items.values()];
		let mapOrder: Block[] | null = keyOrder.length === chain.length ? null : keyOrder;
		for (let i = 0; mapOrder === null && i < keyOrder.length; i++)
			if (keyOrder[i] !== chain[i]) mapOrder = keyOrder;
		record.mapOrder = mapOrder;
	} else {
		// The old head and the recorded nextSiblings reach every old row: a row whose
		// nextSibling was not rewritten still holds it.
		const chain: Block[] = [];
		for (let b = record.head; b !== null; b = links.has(b) ? links.get(b)! : b.nextSibling)
			chain.push(b);
		record.chain = chain;
		// Without a removal the Map has only gained fresh rows' keys, which the old
		// chain excludes; a removal from a Map out of chain order kept its order.
		if (!record.inOrder) {
			const kept = new Set(chain);
			const mapOrder: Block[] = [];
			for (const block of record.prior ?? state.items.values())
				if (kept.has(block)) mapOrder.push(block);
			record.mapOrder = mapOrder;
		}
	}
	if (process.env.NODE_ENV !== 'production' && record.check !== undefined) {
		const chain = record.chain!;
		const [expectedChain, expectedMap = expectedChain] = record.check;
		const restoredMap = record.mapOrder ?? chain;
		if (
			expectedChain.length !== chain.length ||
			expectedChain.some((block, i) => block !== chain[i]) ||
			expectedMap.length !== restoredMap.length ||
			expectedMap.some((block, i) => block !== restoredMap[i])
		)
			throw new Error(formatClientError(343));
	}
}

/**
 * Full clears leave the old item chain untouched. Retain its map and links by
 * reference for rollback, then give any same-attempt refill a fresh key map.
 * The generic journal still snapshots reordered/partially changed lists.
 */
export function journalForListClear(state: ForSlot): void {
	const seen = TRANSITION_JOURNAL_BAGS!;
	// An enclosing window's link record stops gathering links here.
	const at = seen.get(state) ?? -1;
	if (at >= 0)
		fullForSlotRecord(
			state,
			TRANSITION_JOURNAL![at] === JOURNAL_UNDO ? TRANSITION_JOURNAL![at + 2] : null,
		);
	const oldItems = state.items;
	seen.set(state, TRANSITION_JOURNAL!.length);
	const snapshot = {
		head: state.head,
		tail: state.tail,
		size: state.size,
		empty: state.emptyBlock,
		entries: oldItems,
	};
	journalUndo(() => {
		restoreForSlot(state, snapshot, null);
		seen.delete(state);
	});
	state.items = new Map();
	state.inOrder = true;
}

/**
 * Put a keyed list's rows and order back. A root render left the list's DOM
 * as it was (listNext), so only its records move.
 */
function restoreForSlot(state: ForSlot, snapshot: any, chain: Block[] | null): void {
	// Rows the aborted attempt freshly mounted are not in the snapshot, so
	// restoring the old chain would simply forget them. Their DOM goes with the
	// dropped run, but the scope has to go NOW, before the overwrite makes them
	// unreachable: the disposed stamp is what keeps their queued mount effects
	// and ref attaches from firing for a row that never reached the screen, and
	// it runs the render-time cleanups they registered. Removed rows are never
	// on the chain, so this reaches exactly the fresh mounts. For a map-swap
	// clear the original chain cannot become live before its own undo: later
	// windows undo first, and later fills use the replacement map.
	const preservedMap: Map<any, Block> | null = chain === null ? snapshot.entries : null;
	const kept: Set<Block> | null = chain === null ? null : new Set(chain);
	for (let b: Block | null = state.head; b !== null; b = b.nextSibling) {
		if (preservedMap !== null || !kept!.has(b)) unmountBlock(b, false);
	}
	// Those teardowns dispatch their cleanup errors immediately, and an error
	// routed to the enclosing boundary flips it to @catch — disposing this
	// slot's whole range out from under the restore. Same mid-render teardown
	// invariant as renderReturnedValue's disposed check: stop here.
	if (state.end.parentNode === null) return;
	state.head = chain === null ? snapshot.head : (chain[0] ?? null);
	state.tail = chain === null ? snapshot.tail : (chain[chain.length - 1] ?? null);
	state.size = chain === null ? snapshot.size : chain.length;
	if (preservedMap !== null) {
		state.items = preservedMap;
		state.inOrder = false;
	} else {
		const originalChain = chain!;
		state.items.clear();
		for (let i = 0; i < originalChain.length; i++) {
			const block = originalChain[i];
			block.nextSibling = originalChain[i + 1] ?? null;
			block.prevSibling = originalChain[i - 1] ?? null;
			block.itemIndex = i;
		}
		const keyOrder: Block[] = snapshot.mapOrder ?? originalChain;
		for (let i = 0; i < keyOrder.length; i++) {
			const block = keyOrder[i];
			state.items.set(block.key, block);
		}
		state.inOrder = keyOrder === originalChain;
	}
	// The @empty branch swaps with the rows, so it rolls back with them. A
	// branch the aborted render mounted is scope-only torn down.
	if (state.emptyBlock !== snapshot.empty) {
		if (state.emptyBlock !== null) unmountBlock(state.emptyBlock, false);
		state.emptyBlock = snapshot.empty;
	}
}

/** Undo writes and invalidate their rendered owners since `checkpoint`, newest first. */
export function rollbackTransitionJournal(checkpoint: number, owner: Block): void {
	if (checkpoint < 0) return;
	const log = TRANSITION_JOURNAL;
	if (log === null) return;
	// Sample before replay truncates the log. A partial rollback starts at a
	// nonzero checkpoint, so only the entries after it are undone.
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileJournalRolledBack((log.length - checkpoint) / 4);
	const previousReplay = TRANSITION_JOURNAL_REPLAYING;
	TRANSITION_JOURNAL_REPLAYING = true;
	try {
		for (let i = log.length - 4; i >= checkpoint; i -= 4) {
			const target = log[i + 1];
			const a = log[i + 2];
			const b = log[i + 3];
			switch (log[i]) {
				case JOURNAL_PROP:
					target[a] = b;
					break;
				case JOURNAL_INPUTS:
					(target as Block).extra = b;
					(target as Block).props = a;
					break;
				case JOURNAL_CREATED:
					undoCreatedInRootRender(target as Block);
					break;
				case JOURNAL_OPS:
					dropRootOps(target as RootRenderTransaction, a, b);
					break;
				case JOURNAL_RENDER:
					if (!target.disposed && (target === owner || blockIsAncestorOf(owner, target))) {
						invalidateRender(target, owner);
					}
					break;
				case JOURNAL_UNDO:
					target();
					break;
				case JOURNAL_EVENT_OWNER:
					target.$$signalOwner = a;
					break;
				default:
					// Spread snapshots include enumerable symbols as well as strings.
					// Leave non-enumerable state outside the snapshot, including an
					// array's length, which has its own restoration below.
					for (const key of Reflect.ownKeys(target)) {
						if (
							!Object.prototype.hasOwnProperty.call(a, key) &&
							Object.prototype.propertyIsEnumerable.call(target, key)
						)
							delete target[key];
					}
					for (const key of Reflect.ownKeys(a)) {
						// Symbol constants were never assigned by the string-only path.
						// Keep an unchanged read-only symbol valid while still invoking
						// symbol setters and rejecting a value that cannot be restored.
						if (typeof key === 'symbol') {
							if (Reflect.set(target, key, a[key]) || Object.is(target[key], a[key])) continue;
						}
						target[key] = a[key];
					}
					if (b !== null) target.length = b;
					// This bag is back to its pre-window values, so a later write in an
					// enclosing window has to snapshot it again rather than trust the
					// entry that just got replayed.
					TRANSITION_JOURNAL_BAGS!.delete(target);
			}
		}
		log.length = checkpoint;
	} finally {
		TRANSITION_JOURNAL_REPLAYING = previousReplay;
	}
}

export interface FocusSelectionSnapshot {
	focused: HTMLElement;
	start: number;
	end: number;
	contentEditable: boolean;
}

/** Resolve focus through same-origin frames and any nested open shadow roots. */
function activeElementForDocument(doc: Document): Element | null {
	try {
		let focused = doc.activeElement;
		// Unfocused documents usually report body. It can itself host an open
		// shadow tree, so only skip the descent when that tree has no focus.
		if (focused === doc.body) {
			focused = focused?.shadowRoot?.activeElement ?? null;
			if (focused === null) return null;
		}
		while (focused !== null) {
			if (focused.localName === 'iframe') {
				let nested: Document | null;
				try {
					nested = (focused as HTMLIFrameElement).contentDocument;
				} catch {
					break;
				}
				if (nested === null) break;
				const inner = nested.activeElement;
				if (inner === null) break;
				focused = inner;
				continue;
			}
			const inner = focused.shadowRoot?.activeElement;
			if (inner === null || inner === undefined) break;
			focused = inner;
		}
		return focused;
	} catch {
		// Reading activeElement on a torn-down document can throw.
		return null;
	}
}

function hasTextSelection(element: HTMLElement): boolean {
	if (element.localName === 'textarea') return true;
	if (element.localName !== 'input') return false;
	switch ((element as HTMLInputElement).type) {
		case 'text':
		case 'search':
		case 'tel':
		case 'url':
		case 'password':
			return true;
	}
	return false;
}

/** Resolve editable selection offsets without materializing its text every commit. */
function captureContentEditableSelection(
	focused: HTMLElement,
	anchorNode: Node,
	anchorOffset: number,
	focusNode: Node,
	focusOffset: number,
): FocusSelectionSnapshot | null {
	let node: Node = focused;
	let parent: Node | null = null;
	let length = 0;
	let start = -1;
	let end = -1;
	let anchorChildIndex = 0;
	let focusChildIndex = 0;

	selection: for (;;) {
		for (;;) {
			if (node === anchorNode && (anchorOffset === 0 || node.nodeType === 3)) {
				start = length + anchorOffset;
			}
			if (node === focusNode && (focusOffset === 0 || node.nodeType === 3)) {
				end = length + focusOffset;
			}
			if (start !== -1 && end !== -1) break selection;
			if (node.nodeType === 3) length += node.nodeValue!.length;
			const child = getFirstChild(node);
			if (child === null) break;
			parent = node;
			node = child;
		}
		for (;;) {
			if (node === focused) break selection;
			if (parent === anchorNode && ++anchorChildIndex === anchorOffset) start = length;
			if (parent === focusNode && ++focusChildIndex === focusOffset) end = length;
			if (start !== -1 && end !== -1) break selection;
			const sibling = getNextSibling(node);
			if (sibling !== null) {
				node = sibling;
				break;
			}
			node = parent!;
			parent = node.parentNode;
		}
	}

	return start === -1 || end === -1 ? null : { focused, start, end, contentEditable: true };
}

/** Capture selection only when a render pass could actually mutate focused DOM. */
export function captureFocusSelection(doc: Document): FocusSelectionSnapshot | null {
	const focused = activeElementForDocument(doc) as HTMLElement | null;
	if (focused === null || focused === focused.ownerDocument.body) return null;
	if (hasTextSelection(focused)) {
		const input = focused as HTMLInputElement | HTMLTextAreaElement;
		return {
			focused,
			start: input.selectionStart ?? 0,
			end: input.selectionEnd ?? 0,
			contentEditable: false,
		};
	}
	if (focused.contentEditable === 'true' || focused.getAttribute('contenteditable') === 'true') {
		const selection = focused.ownerDocument.getSelection();
		if (
			selection !== null &&
			selection.anchorNode !== null &&
			selection.focusNode !== null &&
			focused.contains(selection.anchorNode) &&
			focused.contains(selection.focusNode)
		) {
			const anchorNode = selection.anchorNode;
			const focusNode = selection.focusNode;
			if (anchorNode === focusNode && anchorNode.nodeType === 3) {
				// A direct first text child has no preceding text to count.
				if (anchorNode === getFirstChild(focused)) {
					return {
						focused,
						start: selection.anchorOffset,
						end: selection.focusOffset,
						contentEditable: true,
					};
				}
				// Below 256 UTF-16 code units, one native prefix walk beats JS traversal;
				// shared-node offset arithmetic also preserves selection direction.
				if (anchorNode.nodeValue!.length < 256) {
					const range = focused.ownerDocument.createRange();
					range.selectNodeContents(focused);
					range.setEnd(anchorNode, selection.anchorOffset);
					const start = range.toString().length;
					return {
						focused,
						start,
						end: start + selection.focusOffset - selection.anchorOffset,
						contentEditable: true,
					};
				}
			}
			const snapshot = captureContentEditableSelection(
				focused,
				anchorNode,
				selection.anchorOffset,
				focusNode,
				selection.focusOffset,
			);
			if (snapshot !== null) return snapshot;
		}
	}
	return { focused, start: -1, end: -1, contentEditable: false };
}

/** Convert a content-editable text offset back into its current text-node position. */
function contentEditablePosition(element: HTMLElement, offset: number): [Node, number] {
	const walker = element.ownerDocument.createTreeWalker(element, 4 /* SHOW_TEXT */);
	let node = walker.nextNode();
	let last: Node | null = null;
	while (node !== null) {
		const length = node.textContent?.length ?? 0;
		if (offset <= length) return [node, offset];
		offset -= length;
		last = node;
		node = walker.nextNode();
	}
	return last === null ? [element, 0] : [last, last.textContent?.length ?? 0];
}

function restoreFocusSelection(snapshot: FocusSelectionSnapshot | null): void {
	if (snapshot === null) return;
	const { focused } = snapshot;
	const doc = focused.ownerDocument;
	if (activeElementForDocument(doc) === focused || !focused.isConnected) return;
	if (snapshot.start !== -1) {
		if (snapshot.contentEditable) {
			const selection = doc.getSelection();
			if (selection !== null) {
				const [anchorNode, anchorOffset] = contentEditablePosition(focused, snapshot.start);
				const [focusNode, focusOffset] = contentEditablePosition(focused, snapshot.end);
				const range = doc.createRange();
				range.setStart(anchorNode, anchorOffset);
				range.collapse(true);
				selection.removeAllRanges();
				selection.addRange(range);
				selection.extend(focusNode, focusOffset);
			}
		} else {
			const input = focused as HTMLInputElement | HTMLTextAreaElement;
			input.setSelectionRange(snapshot.start, Math.min(snapshot.end, input.value.length));
		}
	}
	// Refocusing a moved control may scroll every containing element. Preserve
	// those positions only on this cold, focus-was-actually-lost branch.
	const ancestors: Array<{ element: HTMLElement; left: number; top: number }> = [];
	let parent = focused.parentElement;
	while (parent !== null) {
		ancestors.push({
			element: parent,
			left: parent.scrollLeft,
			top: parent.scrollTop,
		});
		parent = parent.parentElement;
	}
	focused.focus();
	for (let i = 0; i < ancestors.length; i++) {
		const ancestor = ancestors[i];
		ancestor.element.scrollLeft = ancestor.left;
		ancestor.element.scrollTop = ancestor.top;
	}
}

export type FocusSelectionBatch = FocusSelectionSnapshot | FocusSelectionSnapshot[] | null;

/** A global scheduler drain may contain independently focused documents. */
export function captureQueuedFocusSelection(): FocusSelectionBatch {
	if (QUEUE.length === 0) return null;
	const firstDocument = QUEUE[0].parentNode.ownerDocument;
	if (firstDocument === null) return null;
	let snapshots: FocusSelectionBatch = captureFocusSelection(firstDocument);
	let documents: Document[] | null = null;
	for (let i = 1; i < QUEUE.length; i++) {
		const doc = QUEUE[i].parentNode.ownerDocument;
		if (doc === null || doc === firstDocument || documents?.includes(doc)) continue;
		(documents ??= [firstDocument]).push(doc);
		const snapshot = captureFocusSelection(doc);
		if (snapshot === null) continue;
		if (snapshots === null) snapshots = snapshot;
		else if (Array.isArray(snapshots)) snapshots.push(snapshot);
		else snapshots = [snapshots, snapshot];
	}
	return snapshots;
}

export function restoreQueuedFocusSelection(snapshots: FocusSelectionBatch): void {
	if (Array.isArray(snapshots)) {
		for (let i = 0; i < snapshots.length; i++) restoreFocusSelection(snapshots[i]);
	} else {
		restoreFocusSelection(snapshots);
	}
}

export function restoreFocusedMovements(): void {
	if (renderingFocusMoves === null) return;
	for (let i = 0; i < renderingFocusMoves.length; i++) {
		const movement = renderingFocusMoves[i];
		const snapshot = movement.snapshot;
		if (snapshot.contentEditable) {
			const doc = snapshot.focused.ownerDocument;
			const selection = doc.getSelection();
			if (selection !== null && activeElementForDocument(doc) === snapshot.focused) {
				const [anchorNode, anchorOffset] = contentEditablePosition(
					snapshot.focused,
					snapshot.start,
				);
				const [focusNode, focusOffset] = contentEditablePosition(snapshot.focused, snapshot.end);
				if (
					selection.anchorNode !== anchorNode ||
					selection.anchorOffset !== anchorOffset ||
					selection.focusNode !== focusNode ||
					selection.focusOffset !== focusOffset
				) {
					const range = doc.createRange();
					range.setStart(anchorNode, anchorOffset);
					range.collapse(true);
					selection.removeAllRanges();
					selection.addRange(range);
					selection.extend(focusNode, focusOffset);
				}
			}
		}
		for (let j = 0; j < movement.ancestors.length; j++) {
			const ancestor = movement.ancestors[j];
			ancestor.element.scrollLeft = ancestor.left;
			ancestor.element.scrollTop = ancestor.top;
		}
	}
}

// Exact host identities whose attach never committed or whose Suspense hide already
// detached their refs. Host-scoped suppression is crucial: user cleanup can synchronously
// unmount an independent root, whose unrelated refs must still detach normally.
export let REF_DETACH_SUPPRESSION: RefDetachSuppression | null = null;

export function withRegisteredRefDetachSuppression<T>(
	entries: SuspenseRefEntry[] | null,
	fn: () => T,
): T {
	if (entries === null || entries.length === 0) return fn();
	const elements = new Set<Element | FragmentInstance>();
	for (let i = 0; i < entries.length; i++) {
		const el = entries[i].el;
		if (el !== null) elements.add(el);
	}
	if (elements.size === 0) return fn();
	const parent = REF_DETACH_SUPPRESSION;
	REF_DETACH_SUPPRESSION = { elements, parent };
	try {
		return fn();
	} finally {
		REF_DETACH_SUPPRESSION = parent;
	}
}
