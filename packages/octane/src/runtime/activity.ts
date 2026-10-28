// Activity
//
// `<Activity mode>`: hiding and showing subtrees, with their refs and effects.

import { DEOPT_REFS_STAMPED, getDeoptDesc, nodeAfterPortalRange, isHostBlock } from './deopt.js';
import { hydrating } from '../hydration-flag.js';
import { __profileCount, ProfileCounter } from '../profiling.js';
import type {
	ComponentBody,
	Scope,
	Block,
	SuspenseRefEntry,
	UncommittedRefAttaches,
	ActivitySlot,
} from './types.js';
import {
	detachSubtreeRefs,
	activityRefState,
	queueRefAttach,
	activityRefOwners,
	retainActivityTracking,
	releaseActivityTracking,
	ROOT_RENDER_ROLLBACK,
} from './drivers.js';
import { renderBlock } from './signal-owners.js';
import {
	queueRefDetach,
	blockSubtreeDisposed,
	refAttachWasDiscarded,
	type ActivityRefState,
	attachRef,
	type FragmentRefValue,
	type FragmentInstance,
} from './refs.js';
import {
	runEffectCleanupCallback,
	journalRootProperty,
	attachLiveFragmentRef,
	activeFragments,
	MaximumUpdateDepthError,
	scheduleRender,
	ensureActivityVisibilityDriver,
	hideActivityRefs,
} from './engine.js';
import { INSERTION, PASSIVE, discardSubtreeRefAttaches } from './effects.js';
import { HIDDEN_REVEAL_ACTIONS, publishHiddenRevealActions, inInactiveSubtree } from './hooks.js';
import { type TrackedThenable, resumeOnSettle } from './use.js';
import { CURSOR } from './hydration.js';
import {
	blockRare,
	createBlock,
	enqueueEffectEventCommitAction,
	RETURNED_OUTPUT_SCOPE,
	setReturnedOutputOwner,
	registerSlot,
} from './block.js';
import {
	type SuspenseHiddenDom,
	retainHiddenActivityNode,
	releaseHiddenActivityNode,
	enforceHiddenDisplay,
	retainHiddenDisplay,
	releaseHiddenDisplay,
	enforceHiddenText,
	retainHiddenText,
	releaseHiddenText,
	findSuspenseHiddenTry,
	renderWithEffectReconnect,
	findTryHandler,
} from './suspense.js';
import {
	CURRENT_BLOCK,
	ROOT_RENDER_TRANSACTION,
	WIP_CAPTURE,
	renderHiddenActivity,
} from './render.js';
import { SIGNAL_HOST_PROP_SOURCES } from './signal-bindings.js';
import { childSlot } from './child-slots.js';
import { freshSlotEnd, settleFreshSlot } from './branches.js';
import { queueFrontier, noteFrontierMember, atCommit, journalObjectOnce } from './commit.js';
import { getFirstChild, getNextSibling } from './templates.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

/**
 * Props accepted by `<Fragment>` (React's `FragmentProps`, plus `key` and
 * fragment refs). Named so declaration emit can reference it instead of
 * expanding the recursive ref type inline.
 */
export interface FragmentProps {
	children?: unknown;
	key?: string | number | bigint | null | undefined;
	ref?: FragmentRefValue;
}

// ---------------------------------------------------------------------------
// Control flow: activityBlock — React 19 <Activity mode="hidden"|"visible">
//
// Unlike ifBlock (which unmounts on branch change), an Activity keeps ONE
// long-lived child Block across the whole hidden/visible lifecycle. Hidden:
// children stay mounted (state + DOM preserved) but visually hidden via
// display:none and their effects are torn down (cleanups run); the subtree is
// marked `inactive` so re-renders while hidden update the DOM but skip effects.
// Visible: display restored and a re-render re-fires the effects. State is
// preserved because the block is never disposed while toggling.
// ---------------------------------------------------------------------------

/** Cold descriptor/dynamic-tag path; direct compiled Activities call activityBlock. */
export function renderActivityDescriptor(props: any, scope: Scope): void {
	const block = scope.block;
	activityBlock(
		scope,
		0,
		block.parentNode,
		props?.mode ?? 'visible',
		renderActivityChildren,
		block.endMarker,
	);
}

function renderActivityChildren(_props: unknown, scope: Scope): void {
	const block = scope.block;
	// Scoped children must resolve under the Activity, never in its caller.
	childSlot(scope, 0, block.parentNode, block.parentBlock!.props?.children, block.endMarker);
}

export interface ActivityHiddenDom extends Omit<SuspenseHiddenDom, 'active'> {
	nextDisplays: Set<HTMLElement>;
	nextTexts: Set<Text>;
}

function findActivityRefOwners(block: Block): boolean {
	let owned = false;
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		const owner: ActivitySlot | undefined = current.rare?.activitySlot;
		if (owner !== undefined && owner.block === current) {
			owner.hasRefs = true;
			owned = true;
		}
	}
	return owned;
}

export function registerActivityRef(block: Block, target: Element | FragmentInstance): void {
	const refs = activityRefState!;
	if (refs.has(target)) return;
	const owners = activityRefOwners!;
	let owned = owners.get(block);
	if (owned === undefined) {
		// A Block's logical parent is immutable. Cache both positive and negative
		// ownership, so unrelated ref-heavy trees never repeat the ancestor walk.
		owned = findActivityRefOwners(block);
		owners.set(block, owned);
	}
	if (owned) refs.set(target, { connected: null, hidden: false });
}

export function registerActivityInsertionEffect(block: Block): void {
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		const owner: ActivitySlot | undefined = current.rare?.activitySlot;
		if (owner !== undefined && owner.block === current) owner.hasInsertionEffects = true;
	}
}

export function registerActivityPortal(block: Block): void {
	let owners: ActivitySlot[] | null = null;
	for (let parent = block.parentBlock; parent !== null; parent = parent.parentBlock) {
		const owner = parent.rare?.activitySlot;
		if (owner === undefined || owner.block !== parent) continue;
		(owner.portals ??= new Set()).add(block);
		(owners ??= []).push(owner);
	}
	if (owners !== null) {
		const retained = owners;
		(block.cleanups ??= []).push(() => {
			for (const owner of retained) owner.portals!.delete(block);
		});
	}
}

function hideActivityHostRange(block: Block, hidden: ActivityHiddenDom): void {
	let node: ChildNode | null = getNextSibling(block.startMarker!);
	while (node !== null && node !== block.endMarker) {
		// A foreign portal may target this same physical range. Its logical owner
		// decides visibility; owned portal ranges are visited separately below.
		const foreignEnd = (node as any).$$portalEnd as Node | undefined;
		if (foreignEnd !== undefined) {
			node = nodeAfterPortalRange(node, foreignEnd) as ChildNode | null;
			continue;
		}
		if (node.nodeType === 1) {
			const el = node as HTMLElement;
			if (!hidden.nextDisplays.has(el)) {
				hidden.nextDisplays.add(el);
				if (!hidden.displays.has(el)) {
					retainHiddenActivityNode(el);
					retainHiddenDisplay(el, true);
				} else enforceHiddenDisplay(el);
			}
		} else if (node.nodeType === 3) {
			const text = node as Text;
			if (!hidden.nextTexts.has(text)) {
				hidden.nextTexts.add(text);
				if (!hidden.texts.has(text)) {
					retainHiddenActivityNode(text);
					retainHiddenText(text);
				}
				enforceHiddenText(text);
			}
		}
		node = getNextSibling(node);
	}
}

/**
 * Hide every direct child between the block's markers (idempotent). Elements get
 * `display:none`; bare text nodes can't be styled, so their `data` is blanked
 * (original saved for restore). Re-runs after each hidden re-render, so newly
 * created children — and dynamic text re-populated by setText — get re-hidden.
 */
function hideActivityRange(state: ActivitySlot): void {
	const b = state.block;
	if (!b) return;
	const hidden = (state.hiddenDom ??= {
		displays: new Set(),
		texts: new Set(),
		nextDisplays: new Set(),
		nextTexts: new Set(),
	});
	if (!state.fragmentVisibilityCleanupRegistered) {
		state.fragmentVisibilityCleanupRegistered = true;
		(b.cleanups ??= []).push(() => releaseActivityRange(state, false));
	}
	hideActivityHostRange(b, hidden);
	if (state.portals !== null) {
		for (const portal of state.portals) {
			if (!portal.disposed) hideActivityHostRange(portal, hidden);
		}
	}
	// Reconcile ownership against the live ranges, not just parentNode. This
	// releases replaced/moved roots and portal targets without retaining dead DOM.
	for (const el of hidden.displays) {
		if (!hidden.nextDisplays.has(el)) {
			releaseHiddenActivityNode(el);
			releaseHiddenDisplay(el, true);
		}
	}
	for (const text of hidden.texts) {
		if (!hidden.nextTexts.has(text)) {
			releaseHiddenActivityNode(text);
			releaseHiddenText(text);
		}
	}
	const displays = hidden.displays;
	const texts = hidden.texts;
	hidden.displays = hidden.nextDisplays;
	hidden.texts = hidden.nextTexts;
	hidden.nextDisplays = displays;
	hidden.nextTexts = texts;
	displays.clear();
	texts.clear();
}

export function rehideActivityAfterDescendantRender(state: ActivitySlot): void {
	// The render's frontier inserts land at commit: hide the range after them.
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null) transaction.ops.push(rehideActivityRange, state);
	else rehideActivityRange(state);
}

function rehideActivityRange(state: ActivitySlot): void {
	const b = state.block;
	if (b === null || !state.hidden || state.deactivationPending || blockSubtreeDisposed(b)) return;
	// A pending visible→hidden commit intentionally keeps the DOM visible until
	// effect cleanup; its queued commit action will hide the latest range.
	hideActivityRange(state);
}

/** Release this Activity's hide ownership, restoring nodes with no other owner. */
function showActivityRange(state: ActivitySlot): void {
	releaseActivityRange(state, true);
}

function releaseActivityRange(state: ActivitySlot, restore: boolean): void {
	if (!restore) HIDDEN_REVEAL_ACTIONS?.delete(state);
	const hidden = state.hiddenDom;
	if (hidden === null) return;
	for (const el of hidden.displays) {
		releaseHiddenActivityNode(el);
		releaseHiddenDisplay(el, true, restore);
	}
	hidden.displays.clear();
	for (const text of hidden.texts) {
		releaseHiddenActivityNode(text);
		releaseHiddenText(text, restore);
	}
	hidden.texts.clear();
}

/** Reconnect current visible manifests, not stale attaches from hidden renders. */
function queueCurrentActivityRefs(activity: ActivitySlot): void {
	if (!activity.hasRefs) return;
	const block = activity.block!;
	if (inInactiveSubtree(block)) return;
	discardSubtreeRefAttaches(block);
	const state = activityRefState!;
	const refs: SuspenseRefEntry[] = [];
	const seen = new Set<Element | FragmentInstance>();
	collectVisibleSubtreeRefs(block, refs);
	for (const entry of refs) {
		if (seen.has(entry.el) || inInactiveSubtree(entry.scope.block)) continue;
		seen.add(entry.el);
		const record = state.get(entry.el);
		if (record !== undefined && !record.hidden && record.connected === entry.ref) continue;
		queueRefAttach(
			entry.scope,
			activeFragments.has(entry.el as FragmentInstance) ? attachLiveFragmentRef : entry.ref, // instanceof would retain FragmentInstance in Activity-only bundles
			entry.el,
		);
	}
}

export function suspendHiddenActivity(
	state: ActivitySlot,
	thenable: TrackedThenable<unknown>,
): void {
	if (state.pendingThenable === thenable) return;
	state.pendingThenable = thenable;
	const block = state.block!;
	const retry = (): void => {
		if (state.pendingThenable !== thenable || !state.hidden || blockSubtreeDisposed(block)) return;
		scheduleRender(block);
	};
	resumeOnSettle(thenable, retry);
}

function setActivitySuspenseHandler(state: ActivitySlot, hidden: boolean): void {
	const block = state.block!;
	if (hidden) {
		state.suspend ??= (thenable) => suspendHiddenActivity(state, thenable);
		blockRare(block).suspenseHandler = state.suspend;
	} else {
		state.pendingThenable = null;
		blockRare(block).suspenseHandler = null;
	}
}

/** Give an Activity whose client tree landed from a frontier its adopted markers back. */
function restoreActivityRange([block, start, end]: [Block, Comment, Comment]): void {
	if (block.disposed) return;
	block.startMarker = start;
	block.endMarker = end;
}

function queueActivityDeactivation(state: ActivitySlot, block: Block, commitVersion: number): void {
	enqueueEffectEventCommitAction(() => {
		if (
			state.block !== block ||
			blockSubtreeDisposed(block) ||
			state.commitVersion !== commitVersion ||
			!state.hidden ||
			!state.deactivationPending ||
			// An independently scheduled sibling may have suspended the shared
			// boundary after this Activity completed. Its outer Suspense
			// deactivation already tore the effects down using the old committed
			// Event body; retain the pending bit for the eventual Activity replay.
			findSuspenseHiddenTry(block) !== null
		) {
			return;
		}
		// Event bodies were published before commit actions drain. Destroy while
		// the DOM is still connected, then hide the preserved range.
		deactivateScope(block);
		if (blockSubtreeDisposed(block) || state.block !== block) return;
		hideActivityRefs(state);
		if (blockSubtreeDisposed(block) || state.block !== block) return;
		hideActivityRange(state);
		state.deactivationPending = false;
	});
}

export function activityBlock(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	mode: 'visible' | 'hidden' | string,
	body: ComponentBody,
	anchor?: Node | null,
	// Hoisted-helper env tuple (compiled-output Phase 2) — see renderBranchSlot.
	env?: any[],
): void {
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	if (slotKey === 0 && parentScope !== RETURNED_OUTPUT_SCOPE) {
		const state = parentScope.slots[0] as any;
		if (state?.returnedOutput === true) {
			if (state.__kind === 'activityBlockSlot') {
				setReturnedOutputOwner(state, false);
			} else {
				const block = parentScope.block;
				block.outputHandler!(block, null, true);
				if (block.disposed) return;
			}
		}
	}
	if (mode === 'hidden') ensureActivityVisibilityDriver();
	const parentBlock = parentScope.block;
	const hydration = hydrating ? CURSOR : null;
	const wantHidden = mode === 'hidden';
	let state = parentScope.slots[slotKey] as ActivitySlot | undefined;
	if (
		state === undefined &&
		ROOT_RENDER_TRANSACTION !== null &&
		parentBlock.createdStamp !== ROOT_RENDER_TRANSACTION.createdStamp
	) {
		const end = freshSlotEnd(parentBlock, domParent, anchor);
		if (end !== null) {
			try {
				activityBlock(parentScope, slotKey, end.parentNode!, mode, body, end, env);
			} finally {
				settleFreshSlot(parentScope, end, anchor);
			}
			return;
		}
	}

	if (state === undefined) {
		let bStart: Comment;
		let bEnd: Comment;
		// Hydration: visible Activities carry their server-rendered body inside one
		// generic block range; hidden Activities carry the same EMPTY range because
		// their body was intentionally skipped on the server. Adopt either shape.
		const open = hydration?.resolveOpen(anchor ?? null, domParent) ?? null;
		if (open !== null) {
			bStart = open;
			bEnd = hydration!.close(open);
		} else {
			bStart = document.createComment('activity');
			bEnd = document.createComment('/activity');
			domParent.insertBefore(bStart, anchor ?? null);
			domParent.insertBefore(bEnd, anchor ?? null);
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
		retainActivityTracking();
		(b.cleanups ??= []).push(releaseActivityTracking);
		state = {
			__kind: 'activityBlockSlot',
			block: b,
			hidden: false,
			fragmentVisibilityCleanupRegistered: false,
			commitVersion: 0,
			deactivationPending: false,
			pendingThenable: null,
			suspend: null,
			hasRefs: false,
			hasInsertionEffects: false,
			pendingInsertions: null,
			hiddenDom: null,
			portals: null,
		};
		// The back-reference lives on the Block's fixed-shape `rare` record.
		blockRare(b).activitySlot = state;
		parentScope.slots[slotKey] = state;
		registerSlot(parentScope, state);
		const adopted = open !== null;
		const serverRangeEmpty = adopted && getNextSibling(bStart) === bEnd;
		if (adopted && !serverRangeEmpty) hydration!.node = getNextSibling(bStart);
		// A hidden server Activity has no body to hydrate. Mount its client tree
		// freshly between the adopted markers with hydration suspended; this builds
		// preserved state/DOM without making descendants consume unrelated server
		// nodes. The same recovery handles a visible client over hidden server HTML.
		if (serverRangeEmpty && hydration !== null) {
			b.inactive = wantHidden;
			state.hidden = wantHidden;
			if (wantHidden) setActivitySuspenseHandler(state, true);
			hydration.deferredActivities.push(() => {
				if (b.disposed) return;
				// The client tree builds off-document and lands between the adopted
				// markers at commit, which hides it there.
				if (ROOT_RENDER_TRANSACTION !== null) {
					const frag = queueFrontier(b, domParent, bEnd);
					b.parentNode = frag;
					b.startMarker = b.endMarker = null;
					noteFrontierMember(frag, b);
					atCommit(restoreActivityRange, [b, bStart, bEnd]);
				}
				hydration.suspend(() => (state!.hidden ? renderHiddenActivity(state!) : renderBlock(b)));
				if (state!.hidden) atCommit(hideActivityRange, state!);
			});
			hydration.parkPast(bEnd, parentScope);
			return;
		}
		if (wantHidden) {
			// Mount while hidden: render children (creates state + DOM) but no
			// effects — mark inactive BEFORE the render so enqueueEffect skips them.
			b.inactive = true;
			state.hidden = true;
			setActivitySuspenseHandler(state, true);
			renderHiddenActivity(state);
			// Adopted server hosts hide at commit, as the client tree above does.
			if (adopted) atCommit(hideActivityRange, state);
			else hideActivityRange(state);
		} else {
			renderBlock(b);
		}
		if (adopted) hydration!.parkPast(bEnd, parentScope);
		return;
	}

	const b = state.block!;
	const transaction = ROOT_RENDER_TRANSACTION;
	const queued = transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK;
	if (queued && state.hidden !== wantHidden) {
		// A dropped render leaves the Activity as it was: its visibility record,
		// the Block's inactive flag and its suspense handler come back with it.
		journalObjectOnce(state);
		journalRootProperty(b, 'inactive', b.inactive);
		const rare = blockRare(b);
		journalRootProperty(rare, 'suspenseHandler', rare.suspenseHandler);
	}
	b.body = body;
	b.extra = env;
	const commitVersion = ++state.commitVersion;

	if (wantHidden) {
		if (!state.hidden) {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileCount(ProfileCounter.ACTIVITY_HIDE);
			// visible → hidden: prerender latest content with effects suppressed,
			// then commit deactivation after Effect Event publication and before
			// hiding the still-connected DOM range.
			b.inactive = true;
			state.hidden = true;
			state.deactivationPending = true;
			setActivitySuspenseHandler(state, true);
			queueActivityDeactivation(state, b, commitVersion);
			renderHiddenActivity(state);
		} else {
			// hidden → hidden: prerender (no effects), then hide any new children.
			// If a prior visible→hidden attempt has not committed yet, replace its
			// versioned action so the latest render owns the deactivation.
			if (state.deactivationPending) {
				queueActivityDeactivation(state, b, commitVersion);
			}
			renderHiddenActivity(state);
			rehideActivityAfterDescendantRender(state);
		}
	} else {
		if (state.hidden) {
			if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
				__profileCount(ProfileCounter.ACTIVITY_SHOW);
			// hidden → visible: restore DOM, clear inactive, re-render to re-fire
			// effects (deactivateScope cleared their deps so they re-enqueue). A root
			// render restores the DOM as it commits, ahead of the content it patches.
			if (queued) transaction!.ops.push(showActivityRange, state);
			else showActivityRange(state);
			b.inactive = false;
			state.hidden = false;
			state.deactivationPending = false;
			setActivitySuspenseHandler(state, false);
			renderWithEffectReconnect(b, WIP_CAPTURE, state.pendingInsertions);
			state.pendingInsertions = null;
			queueCurrentActivityRefs(state);
		} else {
			// visible → visible: ordinary re-render in place.
			renderBlock(b);
		}
		publishHiddenRevealActions(state);
	}
}

/**
 * Enumerate the LIVE child scopes reachable from `scope` — component children plus
 * every control-flow slot's mounted block(s) — without disposing anything. This is
 * the single home of the control-flow slot taxonomy for non-destructive subtree
 * walks (a new slot kind only needs to be added here): `forBlockSlot` contributes
 * each keyed item block plus the optional `@empty` block; every other slot kind
 * contributes its generic `.block`; a `trySlotSlot` additionally contributes the
 * hidden-but-alive `tryBlock` when the boundary is showing @pending/@catch (the
 * content subtree is hidden, not disposed, so it must still be visited).
 * Shared by detachSubtreeRefs and deactivateScope, which recurse via `visit`.
 */
export function forEachSubtreeChild(
	scope: Scope,
	visit: (child: Scope) => void,
	includeHiddenTry: boolean = true,
): void {
	// Child scopes interleave with the slots by ChildScope.at, as unmount walks.
	const children = scope.children;
	const slots = scope._slots;
	let c = 0;
	if (slots !== null) {
		for (let i = 0, n = slots.length; i < n; i++) {
			if (children !== null)
				for (; c < children.length && children[c].at <= i; c++) visit(children[c].scope);
			const val = slots[i];
			if (val.__kind === 'forBlockSlot') {
				for (let b: Block | null = val.head; b !== null; b = b.nextSibling) visit(b);
				if (val.emptyBlock) visit(val.emptyBlock);
			} else if (val.__kind === 'childSlot') {
				if (val.block) visit(val.block);
				if (val.forSlot) {
					for (let b: Block | null = val.forSlot.head; b !== null; b = b.nextSibling) visit(b);
					if (val.forSlot.emptyBlock) visit(val.forSlot.emptyBlock);
				}
				// Value-position portals keep their Block inside `portal`, not `block`.
				// They remain logical descendants for Suspense effect/ref visibility.
				if (val.portal?.block) visit(val.portal.block);
			} else if (val.block) {
				visit(val.block);
				if (
					includeHiddenTry &&
					val.__kind === 'trySlotSlot' &&
					val.tryBlock &&
					val.tryBlock !== val.block
				) {
					visit(val.tryBlock);
				}
			} else if (val.lite != null) visit(val.lite);
		}
	}
	if (children !== null) for (; c < children.length; c++) visit(children[c].scope);
}

// Detach every host ref in a subtree (object refs → null, callback refs called with
// null), collecting {ref, el} for later re-attach. Suspense uses the detach walk;
// Activity uses the same manifests with its committed-ref visibility tracking.
// React's refs cycle null→node like layout effects even though Octane preserves the
// DOM node. Compiled bodies with ref-carrying bindings stamp a REF MANIFEST on their
// scope (`scope.refFields` — see the Scope interface): flat [kind, field, elField]
// triads naming the binding-bag fields directly, so discovery is an indexed walk over
// slots[0] (no key scan, and the fields take normal 1-char names). De-opt host slots
// store `state.ref` + the node. We recurse through children + control-flow slots via
// forEachSubtreeChild (the same walk deactivateScope uses).
export function detachRegisteredSubtreeRefs(
	scope: Scope,
	out: SuspenseRefEntry[],
	shouldDetach: boolean = true,
	includeHiddenTry: boolean = true,
	uncommitted: UncommittedRefAttaches | null = null,
	activityRefs: WeakMap<Element | FragmentInstance, ActivityRefState> | null = null,
): void {
	// A block managing a de-opt host subtree (deoptItemBody / pure-host items):
	// every node the de-opt reconciler built carries its descriptor (DEOPT_DESC),
	// whose props may hold a ref — walk the DOM subtree for them.
	const deoptRoot = (scope as any).deoptNode as Node | null | undefined;
	if (deoptRoot != null)
		detachDeoptTreeRefs(deoptRoot, out, shouldDetach, scope, uncommitted, activityRefs);
	const rm = scope.refFields;
	if (rm !== null) {
		const bag = scope.slots[0];
		if (bag != null) {
			for (let j = 0, n = rm.length; j < n; j += 3) {
				const kind = rm[j];
				let el;
				let ref;
				if (kind === 'r') {
					// Element ref binding: field holds the ref, partner holds the element.
					el = bag[rm[j + 2]];
					ref = bag[rm[j + 1]];
				} else if (kind === 's') {
					// Spread binding: the committed spread object may carry a ref.
					el = bag[rm[j + 2]];
					if (el == null) continue;
					const spread = bag[rm[j + 1]];
					ref = (spread?.[SIGNAL_HOST_PROP_SOURCES] === true ? spread.resolved : spread)?.ref;
				} else {
					// 'f' — <Fragment ref>: detach the FragmentInstance's current ref;
					// reveal re-attaches the same instance.
					el = bag[rm[j + 1]];
					if (el == null) continue;
					ref = el._currentRef;
				}
				ref ??= activityRefs?.get(el)?.connected;
				if (ref == null) continue;
				out.push({ ref, el, scope });
				if (shouldDetach && !refAttachWasDiscarded(uncommitted, el, ref)) {
					attachRef(ref, null, el);
				}
			}
		}
	}
	const slots = scope.slots;
	for (let i = 0, n = slots.length; i < n; i++) {
		const s = slots[i];
		if (s === null || typeof s !== 'object') continue;
		// De-opt host element slot (value-position `<tag>` / motion-style): { el, anchor, ref }.
		if (s.anchor !== undefined && s.el instanceof Element) {
			const ref = s.ref ?? activityRefs?.get(s.el)?.connected;
			if (ref != null) {
				out.push({ ref, el: s.el, scope });
				if (shouldDetach && !refAttachWasDiscarded(uncommitted, s.el, ref)) {
					attachRef(ref, null, s.el);
				}
			}
		}
		// childSlot managing a pure-host de-opt node — same DEOPT_DESC walk.
		if (s.__kind === 'childSlot' && s.hostNode != null) {
			detachDeoptTreeRefs(s.hostNode, out, shouldDetach, scope, uncommitted, activityRefs);
		}
	}
	forEachSubtreeChild(
		scope,
		(child) =>
			detachSubtreeRefs(child, out, shouldDetach, includeHiddenTry, uncommitted, activityRefs),
		includeHiddenTry,
	);
}

/** Collect the refs that belong to the subtree's CURRENT visible branches. */
export function collectVisibleSubtreeRefs(
	scope: Scope,
	out: SuspenseRefEntry[],
	activityRefs: WeakMap<Element | FragmentInstance, ActivityRefState> | null = null,
): void {
	detachSubtreeRefs(scope, out, false, false, null, activityRefs);
}

// Walk a de-opt-built DOM subtree detaching every stamped descriptor ref
// (object refs → null, callback refs' cleanup). `out` collects {ref, el} pairs for
// the suspense-hide reveal re-attach; teardown callers pass null (permanent detach,
// nothing to re-attach). Nested de-opt elements are stamped too (every element
// reconcileDeoptNode builds gets setDeoptDesc), so recurse through children —
// EXCEPT foreign `<!--portal-->…<!--/portal-->` ranges: a portal targeting one of
// these elements owns its content's refs (its slot detaches them on ITS teardown).
// A host Block renders its element's children through its child slots, whose
// Blocks and hosts hold their own refs: its walk takes only its element's.
export function detachDeoptTreeRefs(
	node: Node,
	out: SuspenseRefEntry[] | null,
	shouldDetach: boolean = true,
	ownerScope?: Scope,
	uncommitted: UncommittedRefAttaches | null = null,
	activityRefs: WeakMap<Element | FragmentInstance, ActivityRefState> | null = null,
): void {
	// No de-opt descriptor ref was ever stamped → nothing to detach or collect
	// anywhere; skip the subtree scan. (Monotone flag — see noteDeoptRef.)
	if (!DEOPT_REFS_STAMPED) return;
	const ref = getDeoptDesc(node)?.props?.ref ?? activityRefs?.get(node as Element)?.connected;
	if (ref != null) {
		if (out !== null) {
			// Suspense-hide: detach NOW (the caller re-attaches on reveal).
			out.push({ ref, el: node as Element, scope: ownerScope! });
			if (shouldDetach && !refAttachWasDiscarded(uncommitted, node as Element, ref)) {
				attachRef(ref, null, node as Element);
			}
		} else {
			// Teardown: DEFER the detach to commit (drainRefDetaches), before the
			// mount attaches. Teardown runs mid-render (reconcile/unmount), and a
			// ref can be a setState function whose value feeds back into what the
			// owner renders (Radix Toast: `ref={setTarget}` gates a portal). Firing
			// `ref(null)` synchronously lets that null-update RENDER before the
			// rebuilt element's deferred attach fires — flipping the owner back,
			// rebuilding again, forever. Deferring puts null + new-element in the
			// SAME commit (React's mutation→layout phasing), so state settles on
			// the new element before the next render pass. Route through
			// queueRefDetach so the entry stride (ref, el, teardown-handler) stays
			// uniform with the compiled-binding path.
			queueRefDetach(ref, node as Element);
		}
	}
	let c: Node | null =
		node === (ownerScope as Block | undefined)?.deoptNode && isHostBlock(ownerScope as Block)
			? null
			: getFirstChild(node);
	while (c !== null) {
		const rangeEnd = (c as any).$$portalEnd as Node | undefined;
		if (rangeEnd != null) {
			c = nodeAfterPortalRange(c, rangeEnd);
			continue;
		}
		detachDeoptTreeRefs(c, out, shouldDetach, ownerScope, uncommitted, activityRefs);
		c = getNextSibling(c);
	}
}

/**
 * Run a subtree's effect CLEANUPS without disposing it, and reset its effect
 * slots so the setups re-fire on reactivation. Used by activityBlock on hide
 * AND by the tryBlock suspense-hide path (hideTryContentAndMountPending):
 * Activity disconnects layout + passive effects. Suspense passes
 * `disconnectPassive=false`: layout effects disconnect, while CONNECTED passive
 * effects remain subscribed until actual deletion, matching React's
 * hidden-primary lifetime. A passive effect that never connected is not part of
 * that hidden primary and resets like a layout one (see below). State, DOM, and
 * blocks stay alive in either case. Both boundaries cycle refs separately from
 * their effect cleanup walk.
 */
export function deactivateScope(scope: Scope, disconnectPassive: boolean = true): void {
	const effects = scope.effectSlots;
	if (effects !== null) {
		for (let index = 0; index < effects.length; index++) {
			const e = effects[index];
			// INSERTION effects stay CONNECTED while hidden (React parity,
			// Activity-test.js:1428): no cleanup on hide, deps kept so the
			// reveal re-render doesn't re-fire them. They own injected styles
			// that must persist while a tree is merely hidden; only a real
			// unmount (unmountScope's effect-slot walk) tears them down.
			//
			// Suspense's `disconnectPassive=false` spares passive effects for the
			// same reason — but only ones that ACTUALLY connected. `connectedFn` is
			// set exclusively by runEffectBody, so a null one has never run: it
			// belongs to a subtree the boundary rendered but never committed —
			// siblings ahead of the call that suspended, or children introduced by a
			// later attempt. There is no subscription to preserve, and its deps are
			// already stamped from that aborted attempt, so sparing it would let the
			// reveal re-render compare equal deps and skip the enqueue, stranding the
			// mount effect — and its cleanup — forever. React fires every mount effect
			// in the subtree when a suspended mount finally commits, so an
			// unconnected passive slot resets exactly like a layout one.
			if (
				e.phase === INSERTION ||
				(!disconnectPassive && e.phase === PASSIVE && e.connectedFn !== null)
			) {
				continue;
			}
			if (typeof e.cleanup === 'function') {
				const cleanup = e.cleanup;
				// Clear it BEFORE firing so unmountScope's effect-slot walk sees
				// no cleanup and won't re-run it.
				e.cleanup = undefined;
				try {
					runEffectCleanupCallback(cleanup, e.phase, scope);
				} catch (err) {
					if (err instanceof MaximumUpdateDepthError) throw err;
					const handler = findTryHandler(scope.block);
					if (handler !== null) handler(err);
					else console.error(err);
				}
			}
			// Force the setup to re-enqueue + re-fire when the subtree reactivates.
			// A cleanup cannot be undone by root rollback. Keep this reset even
			// across a suspended retry so the next visible render reconnects it.
			e.deps = undefined;
			if (e.connectedFn !== null) e.disconnected = true;
		}
	}
	forEachSubtreeChild(scope, (child) => deactivateScope(child, disconnectPassive));
}
