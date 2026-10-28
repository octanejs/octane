// Portals
//
// createPortal, portal slots and targets, and portal event ranges.

import { CURSOR } from './hydration.js';
import { hydrating } from '../hydration-flag.js';
import { __profileTrackComponent } from '../profiling.js';
import { ELEMENT_TAG, PORTAL_TAG } from '../runtime-tags.js';
import { profilePortalComponent } from './profile-probes.js';
import type { ComponentBody, Scope, Block, ElementDescriptor } from './types.js';
import { noop, activityPortalCreated } from './drivers.js';
import { renderBlock } from './signal-owners.js';
import { type FragmentInstance, FRAGMENT_REFS, fragmentDirectNodes } from './refs.js';
import {
	ROOT_RENDER_ROLLBACK,
	journalUndo,
	journalRootProperty,
	isCreatedInRootRender,
	activeFragments,
	registerPortalEventRange,
	unregisterPortalEventRange,
} from './engine.js';
import { blockIsAncestorOf } from './effects.js';
import { createBlock, renderReturnedValue, unmountBlock, registerSlot } from './block.js';
import { CURRENT_BLOCK, ROOT_RENDER_TRANSACTION } from './render.js';
import { renderPortalChild } from './signal-bindings.js';
import { childSlot } from './child-slots.js';
import { nodeAfterPortalRange } from './deopt.js';
import { queueFrontier, noteFrontierMember, atCommit, queueRootDeletion } from './commit.js';
import { getNextSibling } from './templates.js';
import {
	retireHostRange,
	registerDelegationTarget,
	unregisterDelegationTarget,
	prepareRegisteredPortalEventOwners,
} from './events.js';
import { type ControlledState, restoreControlledElement } from './forms.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// A PortalSlot installs its consumers before deferred range publication. Keep
// them installed after the last removal: an event can still be between capture
// and bubble with a route through the former portal.
export let preparePortalEventOwners: typeof prepareRegisteredPortalEventOwners = noop;
export let teardownPortalState: typeof teardownRegisteredPortalState = noop;
export let releasePortalTarget: typeof releaseRegisteredPortalTarget = noop;
// childSlot's optional value regimes. A portal, signal handle or Context
// reaches a renderable hole only from its creator: createPortal installs the
// portal regime, signal bindings the handle subscription, and context creation
// the Context read, so bundles without them keep only these truthiness tests.
export let PORTAL_CHILD: typeof renderPortalChild | null = null;

/**
 * Reassert every armed control in `form` — called right after an
 * octane-driven `form.reset()` (requestFormReset / a successful
 * `<form action={fn}>`): the native reset restored DEFAULTS; controlled
 * fields snap back to their rendered values (React parity). User-initiated
 * reset BUTTONS are untouched (React doesn't restore there either; controlled
 * values return at the next commit).
 */
export function reassertControlledIn(form: HTMLFormElement): void {
	const els = form.elements;
	for (let i = 0; i < els.length; i++) {
		if (((els[i] as any).$$ctrl as ControlledState | undefined) !== undefined) {
			restoreControlledElement(els[i] as Element);
		}
	}
}

// ---------------------------------------------------------------------------
// Portals — createPortal renders into a foreign DOM target while staying
// part of the React-tree for context / unmount / event delegation.
// ---------------------------------------------------------------------------

export interface PortalSlot {
	__kind: 'portalSlotSlot';
	block: Block | null;
	target: Element | DocumentFragment | null;
	key: string | null;
	// The element type the body block was built for (see portalChildType).
	childType: unknown;
	host: Node;
	start: Comment | null;
	end: Comment | null;
	/** Its target delegates its events: from creation, or from the commit that inserts it. */
	registered: boolean;
	fragmentOwners?: FragmentInstance | readonly FragmentInstance[] | undefined;
	fragmentAnchor?: Node | undefined;
	sourceAnchor?: Node;
	interleavedFragment?: FragmentInstance;
}

export function installPortalEvents(): void {
	if (preparePortalEventOwners === noop) {
		preparePortalEventOwners = prepareRegisteredPortalEventOwners;
		teardownPortalState = teardownRegisteredPortalState;
		releasePortalTarget = releaseRegisteredPortalTarget;
	}
}

/**
 * Give a portal its share of its target's event delegation. Portal target
 * hosts handlers stamped via the same `el.$oclick = …` mechanism as the main
 * tree, so it needs the delegated listeners too. Refcounted: a target hosting
 * two portals attaches once, detaches when the last portal unmounts.
 */
function registerPortalTarget(portal: PortalSlot): void {
	const target = portal.target;
	// Torn down before the commit that would have inserted it.
	if (target === null) return;
	registerPortalEventRange(target, portal);
	registerDelegationTarget(target);
	portal.registered = true;
}

/**
 * Mount `body` into `target` (a foreign DOM element), as a child of the
 * current Block in the Block tree. Re-rendering the enclosing Block re-runs
 * the portal body in place. Unmounting the enclosing Block tears the portal
 * down and removes its DOM from `target`.
 */
export function portal(
	parentScope: Scope,
	slotKey: number,
	target: Element | DocumentFragment,
	body: ComponentBody,
	props: any,
	host?: Node,
	// Hoisted-helper env tuple (compiled-output Phase 2): the `__portal$N`
	// body's captured parent locals — stamped as block.extra below.
	env?: any[],
	// Present only when this portal is a direct logical child of Fragment refs.
	fragmentOwners?: FragmentInstance | readonly FragmentInstance[],
	fragmentAnchor?: Node,
): void {
	if (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;
	const prev = parentScope.slots[slotKey] as PortalSlot | undefined;
	const key = portalKey(props);
	if (
		FRAGMENT_REFS &&
		fragmentAnchor !== undefined &&
		fragmentOwners === undefined &&
		prev !== undefined &&
		prev.target === target
	) {
		// It moves committed nodes of the target, so it lands at commit, before
		// what this render's commit then inserts there.
		atCommit(prepareFragmentPortalInterleaving, prev);
	}
	const state = renderPortalState(
		prev ?? null,
		parentScope.block,
		target,
		body,
		key === null ? props : undefined,
		// `host` (passed by the compiler) is the JSX element that contains the
		// createPortal call — the natural "logical parent" for event bubbling. When
		// the portal is at top level the compiler passes the block's parentNode.
		host || parentScope.block.parentNode,
		env,
		key,
	);
	// Register on first creation so the slot is torn down with its parent scope.
	// A rebuild returns a fresh slot, which takes over the replaced one's entry.
	if (prev !== state) {
		journalRootProperty(parentScope.slots, slotKey, parentScope.slots[slotKey]);
		parentScope.slots[slotKey] = state;
		if (prev === undefined) registerSlot(parentScope, state);
		else replacePortalSlot(parentScope, prev, state);
	}
	if (FRAGMENT_REFS && fragmentOwners !== undefined && fragmentAnchor !== undefined) {
		registerFragmentPortalOwners(state, fragmentOwners, fragmentAnchor);
	} else if (fragmentAnchor !== undefined) {
		// A Fragment ref rendered inside this portal belongs to its source-tree
		// position, not the foreign target's physical position. Only the rare
		// compiler-normalized root portal passes this ownerless source anchor.
		state.sourceAnchor = fragmentAnchor;
		let child: ChildNode | null = getNextSibling(state.start!);
		while (child !== null && child !== state.end) {
			if (child.nodeType === 8) {
				const foreignEnd = (child as any).$$portalEnd as Node | undefined;
				if (foreignEnd !== undefined) {
					child = nodeAfterPortalRange(child, foreignEnd) as ChildNode | null;
					continue;
				}
				(child as any).$$portalSourceAnchor = fragmentAnchor;
			}
			child = getNextSibling(child);
		}
	}
}

/**
 * A rebuilt portal's previous slot is already torn down, or deferred to this
 * root's commit, so keeping its registry entry would retain it and its markers
 * until the owner unmounts. The new slot takes the same entry. On rollback the
 * journal restores `prev` there, and the new slot is released by its own
 * creation undo and JOURNAL_CREATED rather than by registerSlot's unmount.
 */
function replacePortalSlot(scope: Scope, prev: PortalSlot, state: PortalSlot): void {
	const slots = scope._slots;
	const index = slots === null ? -1 : slots.indexOf(prev);
	if (index === -1) {
		registerSlot(scope, state);
		return;
	}
	journalRootProperty(slots!, index, prev);
	slots![index] = state;
}

/**
 * Match React's append-to-container semantics for the narrow case where a
 * portal-root Fragment gains a trailing child after another portal mounted in
 * the same target. Keep foreign ranges inside the owner's markers temporarily;
 * a cold cleanup evacuates them before its ordinary contiguous-range teardown.
 */
function prepareFragmentPortalInterleaving(portal: PortalSlot): void {
	const start = portal.start;
	const end = portal.end;
	const target = portal.target;
	const block = portal.block;
	if (start === null || end === null || target === null || block === null) return;
	const firstForeign = getNextSibling(end);
	if (firstForeign === null || (firstForeign as any).$$portalEnd === undefined) return;

	let fragment = portal.interleavedFragment;
	if (fragment === undefined) {
		for (const candidate of activeFragments) {
			if (
				candidate._ownerBlock === block &&
				candidate._startMarker.previousSibling === start &&
				getNextSibling(candidate._endMarker) === end
			) {
				fragment = candidate;
				break;
			}
		}
		if (fragment === undefined) return;
	}

	let lastChild: Element | Text | null = null;
	for (const child of fragmentDirectNodes(fragment)) lastChild = child;
	const tail =
		lastChild === null ? getNextSibling(fragment._startMarker) : getNextSibling(lastChild);
	if (tail === null || tail === end) return;
	for (let node: ChildNode | null = tail; node !== end; node = getNextSibling(node)) {
		if (node === null || node.nodeType !== 8) return;
	}

	const foreignStarts: Node[] = [];
	let after: ChildNode | null = firstForeign;
	while (after !== null) {
		const foreignEnd = (after as any).$$portalEnd as Node | undefined;
		if (foreignEnd === undefined || foreignEnd.parentNode !== target) break;
		foreignStarts.push(after);
		after = getNextSibling(foreignEnd);
	}
	if (foreignStarts.length === 0) return;

	let cursor: ChildNode | null = tail;
	while (cursor !== null) {
		const next: ChildNode | null = getNextSibling(cursor);
		target.insertBefore(cursor, after);
		if (cursor === end) break;
		cursor = next;
	}

	const anchors = (fragment._portalAnchors ??= new Map());
	for (const foreignStart of foreignStarts) anchors.set(foreignStart, new Set());
	if (portal.interleavedFragment === undefined) {
		portal.interleavedFragment = fragment;
		(block.cleanups ??= []).push(() => evacuateInterleavedPortalRanges(portal));
	}
}

/** Move independent nested portal ranges outside their temporary owner. */
function evacuateInterleavedPortalRanges(portal: PortalSlot): void {
	const start = portal.start;
	const end = portal.end;
	const target = portal.target;
	if (start === null || end === null || target === null || end.parentNode !== target) return;
	const destination = getNextSibling(end);
	let node: ChildNode | null = getNextSibling(start);
	while (node !== null && node !== end) {
		const foreignEnd = (node as any).$$portalEnd as Node | undefined;
		if (foreignEnd === undefined || foreignEnd.parentNode !== target) {
			node = getNextSibling(node);
			continue;
		}
		const following = getNextSibling(foreignEnd);
		let cursor: Node | null = node;
		while (cursor !== null) {
			const next: Node | null = getNextSibling(cursor);
			target.insertBefore(cursor, destination);
			if (cursor === foreignEnd) break;
			cursor = next;
		}
		node = following;
	}
}

function registerFragmentPortalOwners(
	portal: PortalSlot,
	owners: FragmentInstance | readonly FragmentInstance[],
	anchor: Node,
): void {
	const previous = portal.fragmentOwners;
	if (previous !== undefined) {
		if (portal.fragmentAnchor === anchor) {
			if (!Array.isArray(previous) && !Array.isArray(owners) && previous === owners) return;
			if (Array.isArray(previous) && Array.isArray(owners) && previous.length === owners.length) {
				let sameOwners = true;
				for (let index = 0; index < previous.length; index++) {
					if (previous[index] !== owners[index]) {
						sameOwners = false;
						break;
					}
				}
				if (sameOwners) return;
			}
		}
		unregisterFragmentPortalOwners(portal);
	}
	portal.fragmentOwners = owners;
	portal.fragmentAnchor = anchor;
	if (Array.isArray(owners)) {
		for (const owner of owners) owner._registerPortal(portal, anchor);
	} else {
		(owners as FragmentInstance)._registerPortal(portal, anchor);
	}
	if (previous === undefined) {
		(portal.block!.cleanups ??= []).push(() => unregisterFragmentPortalOwners(portal));
	}
}

function unregisterFragmentPortalOwners(portal: PortalSlot): void {
	const owners = portal.fragmentOwners;
	const anchor = portal.fragmentAnchor;
	if (owners === undefined || anchor === undefined) return;
	portal.fragmentOwners = undefined;
	portal.fragmentAnchor = undefined;
	if (Array.isArray(owners)) {
		for (const owner of owners) owner._unregisterPortal(portal, anchor);
	} else {
		(owners as FragmentInstance)._unregisterPortal(portal, anchor);
	}
}

/** Infer owner refs for a value-position portal from its stable source anchor. */
export function registerValuePortalFragmentOwners(
	portal: PortalSlot,
	parentBlock: Block,
	anchor: Node,
): void {
	let firstOwner: FragmentInstance | null = null;
	let nestedOwners: FragmentInstance[] | null = null;
	for (const fragment of activeFragments) {
		const owner = fragment._ownerBlock;
		if (owner !== parentBlock && !blockIsAncestorOf(owner, parentBlock)) continue;
		if (fragment._startMarker.parentNode !== anchor.parentNode) continue;
		if (
			(fragment._startMarker.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) ===
			0
		) {
			continue;
		}
		if (
			(fragment._endMarker.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_PRECEDING) ===
			0
		) {
			continue;
		}
		if (firstOwner === null) {
			firstOwner = fragment;
		} else {
			(nestedOwners ??= [firstOwner]).push(fragment);
		}
	}
	if (firstOwner !== null) {
		registerFragmentPortalOwners(portal, nestedOwners ?? firstOwner, anchor);
	}
}

/**
 * Mount-or-update a portal's content into `target` (a foreign element), tracked by
 * a `PortalSlot`. Shared by `portal()` (the compiler fast path for
 * `<el>{createPortal(...)}</el>`) and `childSlot` (the VALUE path — a
 * `createPortal(...)` returned from a component, sitting in a ternary, a fragment
 * root, a render function, etc.). `host` is the logical parent used for event
 * bubbling out of the portal.
 */
export function renderPortalState(
	prev: PortalSlot | null,
	parentBlock: Block,
	target: Element | DocumentFragment,
	rawBody: ComponentBody | unknown,
	rawProps: any,
	host: Node,
	env?: any[],
	key: string | null = null,
): PortalSlot {
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) {
		return hydration.suspend(() =>
			renderPortalState(prev, parentBlock, target, rawBody, rawProps, host, env, key),
		);
	}
	const norm = normalizePortalBody(rawBody, rawProps);
	const childType = portalChildType(rawBody, norm.body);
	let state = prev;
	if (
		state === null ||
		state.target !== target ||
		state.key !== key ||
		state.childType !== childType
	) {
		// First mount, changed key, a different child element type, or the portal
		// moved to a different target → (re)build.
		if (state !== null) teardownPortalState(state);
		const start = document.createComment('portal');
		const end = document.createComment('/portal');
		// Mark the range so the raw de-opt reconciler treats it as FOREIGN content:
		// a portal may target an octane-managed element, and its nodes must survive
		// the target owner's re-renders (React parity — portals coexist with the
		// container's own children). See reconcileDeoptChildren.
		(start as any).$$portalEnd = end;
		// Hooks in the portal body can run before its direct children receive the
		// ordinary $$portalParent stamp below.
		(start as any).$$portalParent = host;
		// A root render builds the portal off-document; its commit appends it.
		const transaction = ROOT_RENDER_TRANSACTION;
		const into =
			transaction !== null && !transaction.aborted && !ROOT_RENDER_ROLLBACK
				? queueFrontier(parentBlock, target, null)
				: target;
		into.appendChild(start);
		into.appendChild(end);
		// The portal owns its start/end markers (default exclusiveMarkers=false), so
		// unmountBlock removes them WITH the content — toggling a portal on/off never
		// leaves orphan `<!--portal-->` comments in a persistent target (e.g.
		// document.body across menu open/close cycles).
		const block = createBlock(
			'portal',
			parentBlock,
			into,
			start,
			end,
			norm.body,
			norm.props,
			env,
			renderReturnedValue,
		);
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
			__profileTrackComponent(block, profilePortalComponent(rawBody, norm.body));
		}
		state = {
			__kind: 'portalSlotSlot',
			block,
			target,
			key,
			childType,
			host,
			start,
			end,
			registered: false,
		};
		if (host.nodeType === 11) noteFrontierMember(host, state);
		activityPortalCreated?.(block);
		if (into !== target) {
			// Its target starts delegating with the commit that inserts it.
			installPortalEvents();
			transaction!.ops.push(registerPortalTarget, state);
		} else {
			registerPortalTarget(state);
			if (ROOT_RENDER_TRANSACTION !== null) {
				const created = state;
				journalUndo(() => releasePortalTarget(created));
			}
		}
		renderBlock(block);
	} else {
		if (state.host !== host) {
			journalRootProperty(state, 'host', state.host);
			journalRootProperty(state.start!, '$$portalParent', (state.start as any).$$portalParent);
			(state.start as any).$$portalParent = host;
		}
		state.host = host;
		if (state.block!.body !== norm.body)
			journalRootProperty(state.block!, 'body', state.block!.body);
		if (state.block!.props !== norm.props)
			journalRootProperty(state.block!, 'props', state.block!.props);
		if (state.block!.extra !== env) journalRootProperty(state.block!, 'extra', state.block!.extra);
		state.block!.body = norm.body;
		state.block!.props = norm.props;
		state.block!.extra = env;
		if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__) {
			__profileTrackComponent(state.block!, profilePortalComponent(rawBody, norm.body));
		}
		renderBlock(state.block!);
	}
	// Stamp `$$portalParent` on every direct child the portal placed between its
	// start/end markers. The dispatcher reads this when bubbling up: on reaching a
	// stamped node it jumps to the logical parent's DOM context instead of
	// continuing into the portal target's natural ancestors — mirroring React's
	// per-fiber portal walk so a click inside a modal bubbles up the logical tree.
	let n: ChildNode | null = getNextSibling(state.start!);
	if (state.interleavedFragment === undefined) {
		while (n !== null && n !== state.end) {
			(n as any).$$portalParent = host;
			(n as any).$$portalContainer = target;
			n = getNextSibling(n);
		}
	} else {
		while (n !== null && n !== state.end) {
			const foreignEnd = (n as any).$$portalEnd as Node | undefined;
			if (foreignEnd !== undefined) {
				n = nodeAfterPortalRange(n, foreignEnd) as ChildNode | null;
				continue;
			}
			(n as any).$$portalParent = host;
			(n as any).$$portalContainer = target;
			n = getNextSibling(n);
		}
	}
	return state;
}

// Tear a portal down: fire its body's cleanups, remove its DOM (incl. the owned
// markers) from the target, and release the target's delegated listeners. Idempotent
// — safe to call twice (childSlot teardown + a later scope-unmount sweep).
function teardownRegisteredPortalState(state: PortalSlot): void {
	const transaction = ROOT_RENDER_TRANSACTION;
	if (
		transaction !== null &&
		!transaction.aborted &&
		!ROOT_RENDER_ROLLBACK &&
		state.block?.mounted &&
		!isCreatedInRootRender(transaction, state.block) &&
		state.target !== null
	) {
		queueRootDeletion(() => teardownPortalState(state), state.start, state.end);
		return;
	}
	if (state.block) {
		// Its DOM lies outside every enclosing deletion's range: retire it here. A
		// portal compiled into a template routes its events through a host element
		// inside its owner, which the enclosing deletion has already retired.
		retireHostRange(state.start, state.end);
		unmountBlock(state.block, true);
		state.block = null;
	}
	releasePortalTarget(state);
}

/**
 * Give back this portal's share of its target's event delegation. The share is
 * a refcount, so it is released once: a root render that rolls back reaches a
 * portal it created through the portal's creation undo and again through its
 * owner's teardown. A released portal no longer owns a target.
 */
function releaseRegisteredPortalTarget(state: PortalSlot): void {
	if (state.target) {
		if (state.registered) {
			unregisterPortalEventRange(state.target, state);
			unregisterDelegationTarget(state.target);
		}
		state.target = null;
	}
}

// A portal body may be a ComponentBody (the octane contract + the compiler fast
// path), an inline component element `createPortal(<Comp .../>, …)` (lowered to an
// ElementDescriptor at value position), or any other renderable (host/array/text).
// Normalize to a ComponentBody + props the portal Block can render directly.
function normalizePortalBody(rawBody: any, rawProps: any): { body: ComponentBody; props: any } {
	if (typeof rawBody === 'function') {
		return { body: rawBody as ComponentBody, props: rawProps };
	}
	// An unkeyed component element renders as the portal Block itself. A keyed
	// one takes the generic path below, whose childSlot remounts it when its key
	// changes, exactly as for a keyed host element.
	// Each field read of a scoped JSX value resolves its record again.
	const type = rawBody != null && rawBody.$$kind === ELEMENT_TAG ? rawBody.type : undefined;
	if (typeof type === 'function' && rawBody.key === null) {
		return {
			body: type as ComponentBody,
			props: rawBody.props,
		};
	}
	// Host element / array / primitive / keyed or non-function component element →
	// render via childSlot inside the portal Block (genericPortalBody has stable
	// identity, so the portal reconciles its content across re-renders rather than
	// rebuilding).
	return {
		body: genericPortalBody as unknown as ComponentBody,
		props: rawBody,
	};
}

// The child identity a portal keeps its body Block for, alongside its target and
// its own key: the unwrapped component type, or genericPortalBody for any other
// renderable (whose childSlot reconciles type and key changes itself). A change
// rebuilds the portal, so `createPortal(<A/>, t)` → `createPortal(<B/>, t)`
// remounts like React. A raw function body is an Octane render function whose
// identity may change every render (an inline arrow), so it never rebuilds.
function portalChildType(rawBody: unknown, body: ComponentBody): unknown {
	return typeof rawBody === 'function' ? null : body;
}

function genericPortalBody(value: any, scope: Block): void {
	childSlot(scope, 0, scope.parentNode, value, scope.endMarker);
}

/**
 * `createPortal(children, target, keyOrProps?)`. A string/number third argument
 * is a reconciliation key. An object remains Octane's optional props for a
 * function portal body. The
 * compiler recognises `{createPortal(...)}` at JSX child position and lowers it to a
 * direct `portal(...)` runtime call — no descriptor allocation on the hot path. This
 * function exists so non-JSX call sites (storing in a variable, passing through props,
 * etc.) still produce something the runtime can dispatch on.
 */

function portalKey(value: unknown): string | null {
	return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}
export interface PortalDescriptor {
	$$kind: typeof PORTAL_TAG;
	key: string | null;
	// The RAW renderable handed to createPortal — a ComponentBody, an ElementDescriptor,
	// or any other renderable (host/array/text). normalizePortalBody resolves it to a
	// ComponentBody + props when the portal Block renders.
	body: ComponentBody | ElementDescriptor | unknown;
	target: Element | DocumentFragment;
	props: any;
}
/* @__NO_SIDE_EFFECTS__ */
export function createPortal(
	body: ComponentBody | ElementDescriptor | unknown,
	target: Element | DocumentFragment,
	props: any = undefined,
): PortalDescriptor {
	PORTAL_CHILD = renderPortalChild;
	const key = portalKey(props);
	return { $$kind: PORTAL_TAG, body, target, key, props: key === null ? props : undefined };
}
