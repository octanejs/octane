// View Transitions
//
// ViewTransition boundaries, names, measurement, and the helpers of the native
// update callback. The engine runs the commit itself (vtFlush).

import { PASSIVE, effectQueues, drainPassiveEffects, pendingPassiveUnmounts } from './effects.js';
import { hydrating } from '../hydration-flag.js';
import { markComponentFlags, COMPONENT_FLAG_BOUNDARY } from '../component-flags.js';
import {
	VIEW_TRANSITION_SCOPE_STYLE_ID as VT_SCOPE_STYLE_ID,
	VIEW_TRANSITION_SCOPE_CSS as VT_SCOPE_CSS,
} from '../css.js';
import type {
	ComponentBody,
	Block,
	RootRenderOwner,
	RootRenderTransaction,
	SlotNext,
	ViewTransitionProps,
} from './types.js';
import { TRANSITION_ROOT_DRIVER } from './drivers.js';
import { LAYOUT_CASCADE_LIMIT, applyRefValue } from './refs.js';
import {
	DEFERRED_LAYOUT_DRIVER,
	QUEUE,
	TRANSITION_QUEUE,
	journalUndo,
	placeRun,
	VT_DRAIN,
	vtScheduleQueuedWork,
	VT_ACTION_CUE,
	ensureViewTransitionDriver,
} from './engine.js';
import { inInactiveSubtree, useLayoutEffect } from './hooks.js';
import { transitionBatchReady, FLUSHED_TRANSITION_BATCHES } from './transitions.js';
import { CURSOR } from './hydration.js';
import { HIDDEN_DISPLAYS, hiddenDisplayNodes } from './suspense.js';
import { CURRENT_BLOCK, TRANSITION_JOURNAL, ROOT_RENDER_TRANSACTION } from './render.js';
import { type RootErrorHandlers, rootErrorHandlersFor, invokeRootErrorHandler } from './roots.js';
import { childSlot } from './child-slots.js';
import { moveBlockBefore } from './lists.js';
import { applySlotNext, atCommit, applyOutgoing, placeRoots, journalObjectOnce } from './commit.js';
import { getFirstChild, getNextSibling } from './templates.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// ─────────────────────────────────────────────────────────────────────────────
// View Transitions (docs/view-transitions-plan.md, Phase 1).
//
// A ViewTransition batch renders like any root render, building new content
// off-document, and holds its commit: the DOM stays as committed until the
// browser's update callback lands it (vtFlush). Resolving the new boundary
// props before the old snapshot is essential for nested update="none": naming
// that child speculatively would cut it out of its parent's old image.
//
// Activation model (resolved at the end of the wrapped drain):
//   enter  — a boundary gains visible hosts (subtree inserted or Activity revealed).
//   exit   — a boundary loses its visible hosts (subtree removed or Activity hidden).
//   update — a surviving boundary that was dirtied by a tracked mutation
//            or whose visible host geometry changed.
// Names: prepared boundary fate selects the old capture. The callback measures
// committed geometry, resolves activations, and names the new captures. Authored
// inline names/classes are restored before the held commit lands and
// again once the transition's `ready` promise settles.
//
// Optional-feature guard: generic scheduler/render paths see only the nullable
// `VIEW_TRANSITION_DRIVER`. The concrete implementation is installed by the
// compiler's module hint, the first boundary render, or the public
// addTransitionType entry point. Apps that never retain any of those APIs
// tree-shake the implementation while keeping one cheap null branch at each
// integration point.

/** Animation class value: a class string, 'auto', 'none', or a per-type map. */
export type ViewTransitionClassValue = string | Record<string, string>;

export type ViewTransitionRef =
	| ((instance: ViewTransitionInstance | null) => void | (() => void))
	| { current: ViewTransitionInstance | null }
	| readonly ViewTransitionRef[]
	| null;

/**
 * Animation handle for one of a boundary's view-transition pseudo-elements —
 * the objects on {@link ViewTransitionInstance}. `animate()`/`getAnimations()`
 * target the pseudo-element via the Web Animations `pseudoElement` option on
 * the document element (React's ViewTransitionPseudoElement shape).
 */
export class ViewTransitionPseudoElement {
	/** The pseudo-element selector, e.g. `::view-transition-new(hero)`. */
	readonly selector: string;
	private readonly scope: Element;
	constructor(pseudo: string, name: string, scope: Element = document.documentElement) {
		this.selector = '::view-transition-' + pseudo + '(' + vtCssName(name) + ')';
		this.scope = scope;
	}
	animate(
		keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
		options?: number | KeyframeAnimationOptions,
	): Animation {
		const opts: KeyframeAnimationOptions =
			typeof options === 'number' ? { duration: options } : { ...(options ?? {}) };
		(opts as { pseudoElement?: string }).pseudoElement = this.selector;
		return this.scope.animate(keyframes, opts);
	}
	getAnimations(_options?: GetAnimationsOptions): Animation[] {
		// Native transition pseudos belong to the document element's pseudo tree,
		// not its own animation list. Include that subtree before selecting ours.
		const all = this.scope.getAnimations?.({ subtree: true }) ?? [];
		const out: Animation[] = [];
		for (const a of all) {
			const effect = a.effect as { target?: Element; pseudoElement?: string } | null;
			if (effect !== null && effect.target === this.scope && effect.pseudoElement === this.selector)
				out.push(a);
		}
		return out;
	}
	getComputedStyle(): CSSStyleDeclaration {
		return this.scope.ownerDocument.defaultView!.getComputedStyle(this.scope, this.selector);
	}
}

/**
 * The instance handed to on* callbacks: the resolved view-transition-name plus
 * `.animate()`-capable handles for the boundary's four pseudo-elements.
 */
export interface ViewTransitionInstance {
	name: string;
	group: ViewTransitionPseudoElement;
	imagePair: ViewTransitionPseudoElement;
	old: ViewTransitionPseudoElement;
	new: ViewTransitionPseudoElement;
}

export interface VTHandle {
	ready: Promise<void>;
	finished: Promise<void>;
	updateCallbackDone?: Promise<void>;
	skipTransition: () => void;
}
type VTStart = (
	update: (() => void | Promise<void>) | { update: () => void | Promise<void>; types: string[] },
) => VTHandle;
// Cache the native function, not an owner: polyfills can be replaced and
// document/element APIs may expose different overloads in the same page.
let VT_CALLBACK_STARTS: WeakSet<VTStart> | null = null;
export function vtStartNative(
	owner: VTOwner,
	update: () => Promise<void>,
	types: string[],
): VTHandle {
	const start = owner.startViewTransition!;
	if (VT_CALLBACK_STARTS?.has(start)) return start.call(owner, update);
	try {
		return start.call(owner, { update, types });
	} catch (error) {
		// WebIDL callback conversion in older engines rejects the options object.
		// Other native failures remain actionable and must reach error reporting.
		if (
			error === null ||
			typeof error !== 'object' ||
			!('name' in error) ||
			error.name !== 'TypeError'
		)
			throw error;
		const handle = start.call(owner, update);
		(VT_CALLBACK_STARTS ??= new WeakSet()).add(start);
		return handle;
	}
}
export type VTOwner = (Document | Element) & { startViewTransition?: VTStart };
export type VTDocument = Document & {
	startViewTransition?: VTStart;
	__octaneViewTransition?: VTHandle | null;
	__octaneViewTransitionScopes?: Map<Element, VTHandle>;
};

interface VTCapture {
	interrupt: () => void;
	ready: Promise<void>;
	release: () => void;
	completed: boolean;
	committed: boolean;
}
interface VTSession {
	owner: VTOwner;
	handle: VTHandle;
	interrupt: (() => void) | undefined;
	/** Undefined while preparing; a release callback once ready; null after release. */
	release: (() => void) | null | undefined;
}

interface VtMeasurement {
	x: number;
	y: number;
	width: number;
	height: number;
	view: boolean;
	clip: boolean;
}
interface VtSavedStyle {
	name: string;
	namePriority: string;
	cls: string;
	classPriority: string;
}
/** One tracked boundary for the current wrapped flush. */
export interface VtRec {
	block: Block;
	owner: VTOwner | null;
	props: ViewTransitionProps | null;
	els: Element[];
	rects: VtMeasurement[];
	nextRects: VtMeasurement[] | null;
	name: string;
	oldName: string;
	oldCaptured: boolean;
	cls: string;
	styles: Map<Element, VtSavedStyle>;
}
export interface VtGroup {
	owner: VTOwner;
	recs: VtRec[];
	records: Map<Block, VtRec>;
	styles: Map<Element, VtSavedStyle>;
	visibleBefore: Set<Block>;
	planned: Map<Block, ViewTransitionProps | null>;
	acts: Array<{ kind: VtActivationKind; rec: VtRec }>;
	animations: Animation[];
	cleanups: Array<() => void>;
	warnedNames: Set<string>;
	handle: VTHandle | null;
	session: VTSession | null;
	valid: boolean;
	arrived: boolean;
	settled: boolean;
	interrupted: boolean;
	skipRequested: boolean;
	restoreRoot: (() => void) | null;
}
type VtActivationKind = 'enter' | 'exit' | 'update' | 'share' | 'parent-enter' | 'parent-exit';

/**
 * Capability table between the generic runtime and the optional ViewTransition
 * implementation. Keep concrete VT globals/functions behind this boundary:
 * otherwise one scheduler branch retains the complete animation graph in every
 * client bundle.
 */
export interface ViewTransitionDriver {
	addType(type: string): void;
	routeFlush(): boolean;
	markActionCue(): void;
	endCue(): void;
	shouldClearTypesAfterFlush(): boolean;
	clearTypes(): void;
	interrupt(): void;
	refreshPendingOwner(owner: RootRenderOwner): void;
	wouldWrap(): boolean;
	wrapResume(work: () => void, getBlocks?: () => readonly Block[]): boolean;
	unregister(block: Block): void;
	markDirty(): void;
	queueAllTransition(): boolean;
	renderBoundary(block: Block, props: ViewTransitionProps): void;
}

/** Mounted boundary blocks; pruned lazily (disposed) + on unmount. */
export const VT_REGISTRY = /* @__PURE__ */ new Set<Block>();
/** Boundaries dirtied by tracked mutations during the current wrapped drain. */
export const VT_DIRTY = /* @__PURE__ */ new Set<Block>();
/** Preparation and capture stay atomic; finished captures animate per owner. */
export let VT_CAPTURE: VTCapture | null = null;
const VT_SESSIONS = /* @__PURE__ */ new Map<VTOwner, VTSession>();
const VT_WAITING_HANDLES = /* @__PURE__ */ new Set<VTHandle>();
let VT_NAME_SEQ = 0;
interface ViewTransitionBoundaryState {
	autoName: string;
	instance: ViewTransitionInstance | null;
	instanceScope: Element | null;
	scopeHost: Element | null;
}
/** Optional boundary identities never add fields to ordinary component blocks. */
const VT_BOUNDARIES = /* @__PURE__ */ new WeakMap<Block, ViewTransitionBoundaryState>();
const VT_REF_SLOT = /* @__PURE__ */ Symbol('ViewTransition.ref');

function vtBoundaryState(block: Block): ViewTransitionBoundaryState {
	let state = VT_BOUNDARIES.get(block);
	if (state === undefined) {
		state = { autoName: '', instance: null, instanceScope: null, scopeHost: null };
		VT_BOUNDARIES.set(block, state);
	}
	return state;
}

/** Resolve a scope root against actual CSS; a supplied style view serves internal preparation. */
export function vtScopeName(host: Element, style = (host as HTMLElement).style): string {
	const inline = style.getPropertyValue('view-transition-name');
	if (inline !== '') return inline;
	const computed = host.ownerDocument.defaultView
		?.getComputedStyle(host)
		.getPropertyValue('view-transition-name');
	// Native scope activation supplies `root` only while active. At that
	// point computed `none` is an authored opt-out, including a stylesheet.
	return computed &&
		(computed !== 'none' ||
			(host as Element & { activeViewTransition?: unknown }).activeViewTransition != null)
		? computed
		: 'root';
}

/** A `<ViewTransition>` block's current props, or null for any other block. */
export function vtProps(block: Block): ViewTransitionProps | null {
	const rare = block.rare;
	return rare === null ? null : rare.vt;
}

export function vtGetName(
	block: Block,
	props: ViewTransitionProps | null = vtProps(block),
): string {
	if (props?.name != null && props.name !== 'auto') return props.name;
	if (props?.scope === 'element') {
		const host = vtScopeHost(block);
		if (host !== null) return vtScopeName(host, (host as HTMLElement).style);
	}
	const state = vtBoundaryState(block);
	if (state.autoName === '') state.autoName = '‹vt' + ++VT_NAME_SEQ + '›';
	return state.autoName;
}

function vtCssName(name: string): string {
	return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(name) : name;
}

/** A declaration owns exactly one host; text siblings would fall outside its capture. */
function vtScopeHost(block: Block): Element | null {
	const els = vtRangeElements(block);
	if (els.length !== 1) return null;
	const end = block.endMarker;
	for (
		let node =
			block.startMarker === null
				? getFirstChild(block.parentNode)
				: getNextSibling(block.startMarker);
		node !== null && node !== end;
		node = getNextSibling(node)
	) {
		if (node.nodeType === 3 && (node.nodeValue ?? '').trim() !== '') return null;
	}
	return els[0];
}

/**
 * Read projected parents directly; selector cloning would materialize whole
 * subtrees. Only a live declaration owns its subtree: the server also stamps
 * `vt-scope="none"` on the hosts of an invalid declaration for the streaming
 * driver, and nothing on the client rewrites that marker, so it must read as
 * "no scope" here or hydrated trees would capture differently from mounted ones.
 */
function vtClosestScope(node: Node | null): Element | null {
	for (; node !== null; node = vtParent(node)) {
		if (node.nodeType === 1 && (node as Element).getAttribute('vt-scope') === 'element')
			return node as Element;
	}
	return null;
}

/**
 * A node's parent as the held commit will leave it: content a render built
 * off-document stands where its frontier lands.
 */
function vtParent(node: Node): Node | null {
	return node.nodeType === 11 && (node as any).$$next !== undefined
		? (node as any).$$next.parent
		: node.parentNode;
}

function vtContains(host: Node, node: Node | null): boolean {
	for (; node !== null; node = vtParent(node)) if (node === host) return true;
	return false;
}

/** Logical declarations bound their physical hosts, including portaled descendants. */
export function vtScopeForBlock(block: Block): VTOwner | null {
	for (let ancestor: Block | null = block; ancestor !== null; ancestor = ancestor.parentBlock) {
		if (vtProps(ancestor)?.scope !== 'element') continue;
		const host = vtScopeHost(ancestor);
		if (host === null) return null;
		if (ancestor !== block) {
			const parent = block.parentNode;
			if (!vtContains(host, parent)) {
				// A composite child may produce the scope host itself; its parent
				// is outside the host even though its rendered range is owned here.
				const elements = vtRangeElements(block);
				if (elements.length === 0 || elements.some((element) => !vtContains(host, element)))
					return null;
			}
		}
		return host as VTOwner;
	}
	for (let current: Block | null = block; current !== null; current = current.parentBlock) {
		const parent = current.parentNode;
		const physical = vtClosestScope(parent);
		if (physical !== null) return physical as VTOwner;
		const owner = parent.nodeType === 9 ? (parent as Document) : parent.ownerDocument!;
		// A template clone still belongs to the inert template document.
		if (owner.defaultView !== null) return owner as VTOwner;
	}
	return null;
}

/** A nested declaration owns its hosts even while its native animation is idle. */
export function vtCaptureElements(block: Block, owner: VTOwner): Element[] {
	return vtRangeElements(block).filter((element) => {
		const nearest = vtClosestScope(element);
		return owner.nodeType === 9 ? nearest === null : nearest === owner;
	});
}

/** Nested declarations may share a direct host; the final release removes its marker. */
const VT_SCOPE_OWNERS = /* @__PURE__ */ new WeakMap<Element, { owners: Block[] }>();
const VT_INVALID_SCOPE_WARNED = /* @__PURE__ */ new WeakSet<Block>();

const VT_SCOPE_STYLED_DOCUMENTS = /* @__PURE__ */ new WeakSet<Document>();

function vtInjectScopeStyle(host: Element): void {
	const owner = host.ownerDocument;
	if (VT_SCOPE_STYLED_DOCUMENTS.has(owner)) return;
	if (
		owner.querySelector(
			`style[data-octane="${VT_SCOPE_STYLE_ID}"],style[data-href~="octane-${VT_SCOPE_STYLE_ID}"]`,
		) === null
	) {
		const style = owner.createElement('style');
		style.setAttribute('data-octane', VT_SCOPE_STYLE_ID);
		style.textContent = VT_SCOPE_CSS;
		owner.head.appendChild(style);
	}
	VT_SCOPE_STYLED_DOCUMENTS.add(owner);
}

export function vtReleaseScopeBoundary(block: Block): void {
	const state = VT_BOUNDARIES.get(block);
	if (state?.scopeHost == null) return;
	const host = state.scopeHost;
	const saved = VT_SCOPE_OWNERS.get(host);
	if (TRANSITION_JOURNAL !== null) journalObjectOnce(state);
	state.scopeHost = null;
	if (saved === undefined) return;
	if (TRANSITION_JOURNAL !== null) journalObjectOnce(saved);
	saved.owners = saved.owners.filter((owner) => owner !== block);
	if (saved.owners.length !== 0) return;
	if (!VT_DRAIN) vtInterruptOwner(host as VTOwner);
	atCommit(vtSyncScopeMarker, host);
	if (TRANSITION_JOURNAL !== null) journalUndo(() => VT_SCOPE_OWNERS.set(host, saved));
	VT_SCOPE_OWNERS.delete(host);
}

/** A scope host's marker, at commit: present while a declaration owns the host. */
function vtSyncScopeMarker(host: Element): void {
	if (VT_SCOPE_OWNERS.get(host) === undefined) host.removeAttribute('vt-scope');
	else if (host.getAttribute('vt-scope') !== 'element') host.setAttribute('vt-scope', 'element');
}

/** Keep nested scopes isolated while leaving authored inline CSS in control. */
function vtPrepareScopeBoundary(block: Block): void {
	const props = vtProps(block);
	if (props?.scope !== 'element' && VT_BOUNDARIES.get(block)?.scopeHost == null) return;
	const host = props?.scope === 'element' ? vtScopeHost(block) : null;
	const state = vtBoundaryState(block);
	if (state.scopeHost !== null && state.scopeHost !== host) vtReleaseScopeBoundary(block);
	if (host === null) {
		if (
			process.env.NODE_ENV !== 'production' &&
			props?.scope === 'element' &&
			!inInactiveSubtree(block) &&
			!VT_INVALID_SCOPE_WARNED.has(block)
		) {
			VT_INVALID_SCOPE_WARNED.add(block);
			console.error(
				'ViewTransition scope="element" requires exactly one host element without non-whitespace text siblings. This declaration will commit without its own animation.',
			);
		}
		return;
	}
	if (TRANSITION_JOURNAL !== null) journalObjectOnce(state);
	let saved = VT_SCOPE_OWNERS.get(host);
	if (saved === undefined) {
		saved = { owners: [] };
		if (TRANSITION_JOURNAL !== null) journalUndo(() => VT_SCOPE_OWNERS.delete(host));
		VT_SCOPE_OWNERS.set(host, saved);
	}
	if (state.scopeHost !== host) {
		if (TRANSITION_JOURNAL !== null) journalObjectOnce(saved);
		saved.owners = [...saved.owners, block];
		state.scopeHost = host;
	}
	if (host.getAttribute('vt-scope') !== 'element') atCommit(vtSyncScopeMarker, host);
	// The commit may adopt a fresh host into another document (an iframe's):
	// its stylesheet owner is the document the host lands in.
	const transaction = ROOT_RENDER_TRANSACTION;
	if (transaction !== null) transaction.ops.push(vtInjectScopeStyle, host);
	else vtInjectScopeStyle(host);
}

interface ViewTransitionScopeRef {
	scope: Element;
	instance: ViewTransitionInstance;
}
const VT_SCOPE_REFS = /* @__PURE__ */ new WeakMap<Block, ViewTransitionScopeRef>();

function vtCreateInstance(name: string, scope: Element): ViewTransitionInstance {
	return {
		name,
		group: new ViewTransitionPseudoElement('group', name, scope),
		imagePair: new ViewTransitionPseudoElement('image-pair', name, scope),
		old: new ViewTransitionPseudoElement('old', name, scope),
		new: new ViewTransitionPseudoElement('new', name, scope),
	};
}

/** A held unnamed scope ref follows committed CSS, including updates in a child. */
function vtScopeRefInstance(block: Block, scope: Element): ViewTransitionInstance {
	const previous = VT_SCOPE_REFS.get(block);
	if (previous?.scope === scope) return previous.instance;
	let current: ViewTransitionInstance | null = null;
	const resolve = (): ViewTransitionInstance => {
		const name = vtScopeName(scope);
		if (current === null || current.name !== name) current = vtCreateInstance(name, scope);
		return current;
	};
	const instance: ViewTransitionInstance = {
		get name() {
			return resolve().name;
		},
		get group() {
			return resolve().group;
		},
		get imagePair() {
			return resolve().imagePair;
		},
		get old() {
			return resolve().old;
		},
		get new() {
			return resolve().new;
		},
	};
	if (TRANSITION_JOURNAL !== null)
		journalUndo(() => {
			if (previous === undefined) VT_SCOPE_REFS.delete(block);
			else VT_SCOPE_REFS.set(block, previous);
		});
	VT_SCOPE_REFS.set(block, { scope, instance });
	return instance;
}

function vtGetInstance(
	block: Block,
	name = vtGetName(block),
	target = vtScopeForBlock(block),
): ViewTransitionInstance {
	const state = vtBoundaryState(block);
	const parent = block.parentNode;
	const owner = parent.nodeType === 9 ? (parent as Document) : parent.ownerDocument!;
	const scope =
		target?.nodeType === 1
			? (target as Element)
			: target?.nodeType === 9
				? (target as Document).documentElement
				: owner.documentElement;
	// Live ref mode is separate from the immutable name/owner cache. An explicit
	// prop equal to the current CSS name must still detach the live ref lifetime.
	const props = vtProps(block);
	if (
		!block.disposed &&
		target?.nodeType === 1 &&
		props?.scope === 'element' &&
		(props.name == null || props.name === 'auto')
	) {
		const live = VT_SCOPE_REFS.get(block);
		if (live?.scope === scope && live.instance.name === name) return live.instance;
	}
	if (state.instance !== null && state.instance.name === name && state.instanceScope === scope)
		return state.instance;
	if (TRANSITION_JOURNAL !== null) journalObjectOnce(state);
	state.instanceScope = scope;
	return (state.instance = vtCreateInstance(name, scope));
}

/**
 * React's `addTransitionType` (experimental `unstable_addTransitionType`):
 * tags the current transition with a type. ViewTransition class props given as
 * per-type maps resolve against the batch's types, and the types array reaches
 * every on* callback. Types reset when the batch commits.
 */
export function addTransitionType(type: string): void {
	ensureViewTransitionDriver().addType(type);
}

/**
 * Compiler module-load hint: emitted once per client module that imports
 * ViewTransition from 'octane', so the very first transition flush that MOUNTS
 * a boundary is already wrapped (the runtime otherwise learns "this app uses
 * VT" only mid-drain — too late to have snapshotted). Semi-public (tier 2).
 */
export function __vtSeen(): void {
	ensureViewTransitionDriver();
}

/** Nearest enclosing ViewTransition boundary of the currently rendering block. */
export function vtMarkDirtyFromCurrentBlock(): void {
	for (let b: Block | null = CURRENT_BLOCK; b !== null; b = b.parentBlock) {
		if (b.rare !== null && b.rare.vt !== null) {
			// Innermost boundary only (React's rule) — stop at the first hit.
			if (!b.disposed) VT_DIRTY.add(b);
			return;
		}
	}
}

/** Whether a retained visibility boundary owns this host or one of its ancestors. */
function vtHostVisible(element: Element): boolean {
	if (hiddenDisplayNodes === 0) return true;
	for (let node: Node | null = element; node !== null; node = vtParent(node)) {
		if (node.nodeType === 1 && HIDDEN_DISPLAYS.has(node as HTMLElement)) return false;
	}
	return true;
}

/** Top-level visible ELEMENT nodes of a boundary block's DOM range. */
function vtRangeElements(block: Block): Element[] {
	const els: Element[] = [];
	if (inInactiveSubtree(block)) return els;
	if (block.startMarker !== null && block.endMarker !== null) {
		for (let n = getNextSibling(block.startMarker); n !== null && n !== block.endMarker;) {
			if (n.nodeType === 1 && vtHostVisible(n as Element)) els.push(n as Element);
			n = getNextSibling(n);
		}
	} else {
		// Whole-container regime (root / owns-parent): every element child.
		const kids = (block.parentNode as Element).children;
		for (let i = 0; i < kids.length; i++) {
			if (vtHostVisible(kids[i])) els.push(kids[i]);
		}
	}
	return els;
}

/** Combine every active type; any matching `none` deactivates the class. */
function vtClassByType(
	value: ViewTransitionClassValue | undefined,
	types: string[],
): string | undefined {
	if (value == null || typeof value === 'string') return value;
	let result: string | undefined;
	for (const type of types) {
		const match = value[type];
		if (match == null) continue;
		if (match === 'none') return 'none';
		result = result === undefined ? match : result + ' ' + match;
	}
	return result ?? value['default'];
}

function vtResolveClass(
	props: ViewTransitionProps | null,
	kind: VtActivationKind,
	types: string[],
): string {
	if (props === null) return 'auto';
	const value =
		kind === 'enter'
			? props.enter
			: kind === 'exit'
				? props.exit
				: kind === 'update'
					? props.update
					: kind === 'share'
						? props.share
						: kind === 'parent-enter'
							? props.parentEnter
							: props.parentExit;
	return vtClassByType(value, types) ?? vtClassByType(props.default, types) ?? 'auto';
}

function vtRelayParticipates(
	props: ViewTransitionProps | null,
	kind: 'parent-enter' | 'parent-exit',
): boolean {
	if (props === null) return false;
	return kind === 'parent-enter'
		? props.parentEnter !== undefined || typeof props.onParentEnter === 'function'
		: props.parentExit !== undefined || typeof props.onParentExit === 'function';
}

function vtRelayHasClass(
	props: ViewTransitionProps | null,
	kind: 'parent-enter' | 'parent-exit',
): boolean {
	return (
		props !== null &&
		(kind === 'parent-enter' ? props.parentEnter !== undefined : props.parentExit !== undefined)
	);
}

function vtRelayOutermost(
	b: Block,
	kind: 'parent-enter' | 'parent-exit',
	inUnit: (x: Block) => boolean,
	types: string[],
): Block | null {
	let outer = vtNearestBoundaryAncestor(b);
	if (outer === null || !inUnit(outer)) return null;
	while (true) {
		const up = vtNearestBoundaryAncestor(outer);
		if (up === null || !inUnit(up)) return outer;
		if (
			!vtRelayParticipates(vtProps(outer), kind) ||
			(vtRelayHasClass(vtProps(outer), kind) &&
				vtResolveClass(vtProps(outer), kind, types) === 'none')
		)
			return null;
		outer = up;
	}
}

function vtApplyStyles(rec: VtRec, cls: string): void {
	if (rec.name === '') rec.name = vtGetName(rec.block, rec.props);
	if (rec.name === 'none' && rec.owner?.nodeType === 1 && rec.els[0] === rec.owner) return;
	rec.cls = cls === 'auto' || cls === 'none' ? '' : cls;
	for (let i = 0; i < rec.els.length; i++) {
		const el = rec.els[i] as HTMLElement;
		const style = el.style;
		if (style === undefined) continue;
		if (!rec.styles.has(el)) {
			rec.styles.set(el, {
				name: style.getPropertyValue('view-transition-name'),
				namePriority: style.getPropertyPriority('view-transition-name'),
				cls: style.getPropertyValue('view-transition-class'),
				classPriority: style.getPropertyPriority('view-transition-class'),
			});
		}
		const scopeRoot = rec.owner === el && rec.props?.scope === 'element';
		// Let native self-participation honor stylesheet names (and `none`).
		// An explicit component name is the only override for a scope root.
		if (!scopeRoot || (rec.props?.name != null && rec.props.name !== 'auto'))
			style.setProperty(
				'view-transition-name',
				vtCssName(i === 0 ? rec.name : rec.name + '-' + i),
				scopeRoot ? 'important' : '',
			);
		if (rec.cls !== '') style.setProperty('view-transition-class', rec.cls);
	}
}

/**
 * All records in a native transition share a style snapshot. Restore it before
 * rendering so authored style changes are observed normally, then snapshot the
 * newly committed styles when names are reapplied for the new capture.
 */
export function vtRevertNames(recs: VtRec[]): void {
	if (recs.length === 0) return;
	const styles = recs[0].styles;
	for (const [el, saved] of styles) {
		const style = (el as HTMLElement).style;
		style.setProperty('view-transition-name', saved.name, saved.namePriority);
		style.setProperty('view-transition-class', saved.cls, saved.classPriority);
	}
	styles.clear();
}

function vtInViewport(rect: DOMRect, view: Window | null): boolean {
	return (
		view === null ||
		(rect.x + rect.width > 0 &&
			rect.y + rect.height > 0 &&
			rect.x < view.innerWidth &&
			rect.y < view.innerHeight)
	);
}

function vtMeasureElements(els: Element[], measureClip = false): VtMeasurement[] {
	const result: VtMeasurement[] = [];
	for (const el of els) {
		const r = el.getBoundingClientRect();
		const view = el.ownerDocument.defaultView;
		// Only the new geometry's clipping flags participate in activation.
		const computed = measureClip ? view?.getComputedStyle(el) : undefined;
		result.push({
			x: r.x,
			y: r.y,
			width: r.width,
			height: r.height,
			view: vtInViewport(r, view),
			clip:
				computed !== undefined &&
				((!!computed.overflow && computed.overflow !== 'visible') ||
					(!!computed.clipPath && computed.clipPath !== 'none') ||
					(!!computed.filter && computed.filter !== 'none') ||
					(!!computed.mask && computed.mask !== 'none') ||
					(!!computed.borderRadius && computed.borderRadius !== '0px')),
		});
	}
	return result;
}

function vtAnyInViewport(rects: VtMeasurement[]): boolean {
	for (const rect of rects) if (rect.view) return true;
	return false;
}

function vtNearestBoundaryAncestor(b: Block): Block | null {
	for (let p = b.parentBlock; p !== null; p = p.parentBlock)
		if (p.rare !== null && p.rare.vt !== null) return p;
	return null;
}

function vtElsChanged(before: Element[], after: Element[]): boolean {
	if (before.length !== after.length) return true;
	for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) return true;
	return false;
}

function vtRectChanged(rec: VtRec): boolean {
	const next = rec.nextRects!;
	if (rec.rects.length !== next.length) return true;
	for (let i = 0; i < next.length; i++) {
		const a = rec.rects[i],
			b = next[i];
		if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) return true;
	}
	return false;
}

export function vtCreateRecord(
	block: Block,
	els: Element[],
	styles: Map<Element, VtSavedStyle>,
	props = vtProps(block),
	owner = vtScopeForBlock(block),
	name = vtGetName(block, props),
): VtRec {
	return {
		block,
		owner,
		props,
		els,
		rects: vtMeasureElements(els),
		nextRects: null,
		name,
		oldName: name,
		oldCaptured: false,
		cls: '',
		styles,
	};
}

/** Hide a pre-captured old group after determining that it must not animate. */
function vtCancelOldCapture(rec: VtRec, cancelledAnimations: Animation[]): void {
	const root =
		rec.owner?.nodeType === 1 ? (rec.owner as Element) : rec.els[0]?.ownerDocument.documentElement;
	if (root === undefined || typeof root.animate !== 'function') return;
	for (let i = 0; i < rec.rects.length; i++) {
		cancelledAnimations.push(
			root.animate({ opacity: [0, 0], pointerEvents: ['none', 'none'] }, {
				duration: 0,
				fill: 'forwards',
				pseudoElement:
					'::view-transition-group(' +
					vtCssName(i === 0 ? rec.oldName : rec.oldName + '-' + i) +
					')',
			} as KeyframeAnimationOptions),
		);
	}
}

/** Fire a boundary's activation callback (after the transition's `ready`). */
export function vtFireCallback(
	kind: VtActivationKind,
	rec: VtRec,
	types: string[],
): void | (() => void) {
	const props = rec.props;
	if (props === null) return;
	const cb =
		kind === 'enter'
			? props.onEnter
			: kind === 'exit'
				? props.onExit
				: kind === 'update'
					? props.onUpdate
					: kind === 'share'
						? props.onShare
						: kind === 'parent-enter'
							? props.onParentEnter
							: props.onParentExit;
	if (typeof cb !== 'function') return;
	const instance = vtGetInstance(rec.block, rec.name, rec.owner);
	try {
		const cleanup = cb(instance, types);
		if (typeof cleanup === 'function') return cleanup;
	} catch (err) {
		console.error(err);
	}
}

/** Observe only an active capture; ordinary host writes retain their direct path. */
export function vtObserveChanges(owner: Document, recs: VtRec[]): () => MutationRecord[] {
	const Observer = owner.defaultView?.MutationObserver;
	if (Observer === undefined) return () => [];
	const observer = new Observer(() => {});
	const roots = new Set<Node>([owner]);
	const controls = new Map<Element, string>();
	for (const rec of recs) {
		for (const el of rec.els) {
			roots.add(el.getRootNode());
			if (el.matches('input,textarea,select')) controls.set(el, vtControlValue(el));
			for (const control of el.querySelectorAll('input,textarea,select')) {
				controls.set(control, vtControlValue(control));
			}
		}
	}
	for (const root of roots)
		observer.observe(root, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true,
		});
	return () => {
		const mutations = observer.takeRecords();
		observer.disconnect();
		const hosts = new Map<Element, Block>();
		for (const block of VT_REGISTRY) {
			if (block.disposed) continue;
			for (const el of vtRangeElements(block)) {
				const prior = hosts.get(el);
				if (prior === undefined) hosts.set(el, block);
				else
					for (
						let ancestor = block.parentBlock;
						ancestor !== null;
						ancestor = ancestor.parentBlock
					) {
						if (ancestor === prior) {
							hosts.set(el, block);
							break;
						}
					}
			}
		}
		const dirty = (target: Node): void => {
			for (let node: Node | null = target; node !== null; node = node.parentNode) {
				const block = hosts.get(node as Element);
				if (block !== undefined) {
					VT_DIRTY.add(block);
					break;
				}
			}
		};
		for (const mutation of mutations) dirty(mutation.target);
		// Value/checked/selection properties do not produce mutation records.
		for (const [control, before] of controls) {
			if (control.isConnected && vtControlValue(control) !== before) dirty(control);
		}
		return mutations;
	};
}

function vtControlValue(el: Element): string {
	const control = el as HTMLInputElement;
	if (el.localName === 'select') {
		let selected = '';
		for (const option of (el as HTMLSelectElement).options) selected += option.selected ? '1' : '0';
		return selected;
	}
	return control.value + '\0' + control.checked;
}

/** Only resources introduced or changed by this commit may delay its snapshot. */
export function vtWaitForResources(
	owner: Document,
	fontsWereLoaded: boolean,
	mutations: MutationRecord[],
	captureOwners?: Set<VTOwner>,
): Promise<void> | null {
	const candidates = new Set<Element>();
	const collect = (node: Node): void => {
		if (node.nodeType !== 1) return;
		const el = node as Element;
		if (el.matches('img,link[rel="stylesheet"]')) candidates.add(el);
		for (const child of el.querySelectorAll('img,link[rel="stylesheet"]')) candidates.add(child);
	};
	for (const mutation of mutations) {
		if (mutation.type === 'childList') for (const node of mutation.addedNodes) collect(node);
		else if (
			mutation.type === 'attributes' &&
			/^(src|srcset|sizes|href|rel)$/.test(mutation.attributeName!)
		)
			collect(mutation.target);
	}
	const waits: Promise<unknown>[] = [];
	const release: Array<() => void> = [];
	if (fontsWereLoaded) {
		// Reading layout starts font loads selected by the newly committed styles.
		void owner.documentElement.clientHeight;
		if (owner.fonts?.status === 'loading') waits.push(owner.fonts.ready);
	}
	for (const el of candidates) {
		if (!el.isConnected) continue;
		if (el.localName === 'img') {
			// Images outside the participating native scopes cannot affect their
			// snapshots. Fonts and stylesheets still affect document-wide layout.
			if (
				captureOwners !== undefined &&
				!captureOwners.has((vtClosestScope(el) ?? owner) as VTOwner)
			)
				continue;
			const img = el as HTMLImageElement;
			if (
				img.complete ||
				img.loading === 'lazy' ||
				img.onload !== null ||
				(img as HTMLImageElement & { $oload?: unknown }).$oload != null
			)
				continue;
			const rect = img.getBoundingClientRect();
			const win = owner.defaultView!;
			if (!vtInViewport(rect, win)) continue;
		} else if ((el as HTMLLinkElement).sheet !== null) continue;
		waits.push(
			new Promise<void>((resolve) => {
				const done = (): void => {
					el.removeEventListener('load', done);
					el.removeEventListener('error', done);
					resolve();
				};
				el.addEventListener('load', done);
				el.addEventListener('error', done);
				release.push(done);
			}),
		);
	}
	if (waits.length === 0) return null;
	return new Promise<void>((resolve) => {
		const timer = setTimeout(done, 500);
		function done(): void {
			clearTimeout(timer);
			for (const cleanup of release) cleanup();
			resolve();
		}
		Promise.allSettled(waits).then(done);
	});
}

export function vtReportError(
	error: unknown,
	recs: VtRec[],
	skipped: boolean,
	planned?: Iterable<Block>,
): void {
	if (error !== null && typeof error === 'object') {
		const e = error as { name?: string; message?: string };
		if (skipped && e.name === 'AbortError') return;
		if (
			e.name === 'InvalidStateError' &&
			(e.message?.includes('visibility') ||
				e.message?.includes('viewport size changed') ||
				e.message === 'Transition was aborted because of invalid state')
		)
			return;
	}
	const roots = new Set<RootErrorHandlers>();
	for (const rec of recs) {
		const handlers = rootErrorHandlersFor(rec.block);
		if (handlers?.onRecoverableError !== undefined) roots.add(handlers);
	}
	// Entering boundaries have no old capture record, but their roots still
	// own native failures that occur before the update callback can run.
	if (planned !== undefined)
		for (const block of planned) {
			const handlers = rootErrorHandlersFor(block);
			if (handlers?.onRecoverableError !== undefined) roots.add(handlers);
		}
	if (roots.size === 0) console.error(error);
	else for (const handlers of roots) invokeRootErrorHandler(handlers.onRecoverableError!, error);
}

/** Constant size tracks need not force layout on every animation frame. */
export function vtPruneStaticDimensions(effect: KeyframeEffect, owner: Document): void {
	if (typeof effect.getKeyframes !== 'function') return;
	const frames = effect.getKeyframes();
	if (frames.length < 2) return;
	const width = frames[0]['width'];
	const height = frames[0]['height'];
	if (
		width === undefined ||
		height === undefined ||
		!frames.every((frame) => frame['width'] === width && frame['height'] === height)
	)
		return;
	const simplified = frames.map((frame) => {
		const copy = { ...frame };
		delete copy['width'];
		delete copy['height'];
		if (copy['transform'] === 'none') delete copy['transform'];
		return copy;
	});
	effect.setKeyframes(simplified);
	const underlying = owner.defaultView!.getComputedStyle(effect.target!, effect.pseudoElement);
	if (underlying.width !== width || underlying.height !== height) effect.setKeyframes(frames);
}

/** Native slots are shared with streamed reveals, using the actual native handles. */
export function vtOwnerDocument(owner: VTOwner): VTDocument {
	return (owner.nodeType === 9 ? owner : owner.ownerDocument!) as VTDocument;
}

export function vtBeginCapture(interrupt: () => void): VTCapture {
	let release!: () => void;
	const capture: VTCapture = {
		interrupt,
		ready: new Promise<void>((resolve) => {
			release = resolve;
		}),
		release: () => release(),
		completed: false,
		committed: false,
	};
	VT_CAPTURE = capture;
	return capture;
}

export function vtRegisterHandle(
	owner: VTOwner,
	handle: VTHandle,
	interrupt?: () => void,
): VTSession {
	const session: VTSession = { owner, handle, interrupt, release: undefined };
	VT_SESSIONS.set(owner, session);
	const doc = vtOwnerDocument(owner);
	if (owner.nodeType === 9) doc.__octaneViewTransition = handle;
	else (doc.__octaneViewTransitionScopes ??= new Map()).set(owner as Element, handle);
	return session;
}

/** Release only after every native ready promise settled and names were restored. */
export function vtCompleteCapture(capture: VTCapture): void {
	if (capture.completed) return;
	capture.completed = true;
	if (VT_CAPTURE === capture) VT_CAPTURE = null;
	capture.release();
	vtScheduleQueuedWork();
}

export function vtFinishHandle(session: VTSession): void {
	const { owner, handle } = session;
	if (VT_SESSIONS.get(owner) === session) VT_SESSIONS.delete(owner);
	const doc = vtOwnerDocument(owner);
	if (owner.nodeType === 9) {
		if (doc.__octaneViewTransition === handle) doc.__octaneViewTransition = null;
	} else if (doc.__octaneViewTransitionScopes?.get(owner as Element) === handle) {
		doc.__octaneViewTransitionScopes.delete(owner as Element);
	}
	vtScheduleQueuedWork();
}

/** Queue ancestors may replace any nested scope, so the entire batch waits together. */
export function vtQueuedOwners(blocks: readonly Block[] = QUEUE): Set<VTOwner> | null {
	if (blocks.length === 0) return null;
	const owners = new Set<VTOwner>();
	for (const block of blocks) {
		// Invalid declarations and out-of-scope portals have no capture owner,
		// but their physical mutations affect only this scope/document, not all
		// unrelated native sessions.
		const parent = block.parentNode;
		const owner =
			vtScopeForBlock(block) ??
			vtClosestScope(parent) ??
			(parent.nodeType === 9 ? parent : parent.ownerDocument!);
		owners.add(owner as VTOwner);
	}
	const queued = blocks.length > 1 ? new Set(blocks) : null;
	for (const boundary of VT_REGISTRY) {
		if (boundary.disposed || vtProps(boundary) === null) continue;
		for (let ancestor = boundary.parentBlock; ancestor !== null; ancestor = ancestor.parentBlock) {
			if (queued === null ? ancestor !== blocks[0] : !queued.has(ancestor)) continue;
			const owner = vtScopeForBlock(boundary);
			if (owner !== null) owners.add(owner);
			break;
		}
	}
	return owners;
}

function vtOwnerAffected(owner: VTOwner, owners: Set<VTOwner> | null): boolean {
	if (owners === null || owners.has(owner)) return true;
	for (const candidate of owners) {
		// Persistent child scopes are isolated from animating ancestors. An
		// incoming element owner may remove its children. Document ownership
		// alone is insufficient: unrelated unscoped updates share that owner,
		// while queued root/ancestor blocks explicitly include nested scopes.
		if (
			candidate.nodeType !== 9 &&
			owner.nodeType !== 9 &&
			(candidate as Element).contains(owner as Element)
		)
			return true;
	}
	return false;
}

function vtDocumentsForOwners(owners: Set<VTOwner> | null): Set<VTDocument> {
	const docs = new Set<VTDocument>();
	if (owners !== null) {
		for (const owner of owners) docs.add(vtOwnerDocument(owner));
	} else {
		for (const session of VT_SESSIONS.values()) docs.add(vtOwnerDocument(session.owner));
		if (typeof document !== 'undefined') docs.add(document as VTDocument);
	}
	return docs;
}

export function vtActiveHandles(owners: Set<VTOwner> | null): Set<VTHandle> {
	const handles = new Set<VTHandle>();
	for (const session of VT_SESSIONS.values())
		if (vtOwnerAffected(session.owner, owners)) handles.add(session.handle);
	for (const doc of vtDocumentsForOwners(owners)) {
		const handle = doc.__octaneViewTransition;
		// An external document update has no Octane capture receipt. Its pending
		// callback can block element callbacks, so wait conservatively.
		if (handle != null && VT_SESSIONS.get(doc)?.handle !== handle) handles.add(handle);
		for (const [owner, scoped] of doc.__octaneViewTransitionScopes ?? []) {
			if (vtOwnerAffected(owner as VTOwner, owners)) handles.add(scoped);
		}
	}
	return handles;
}

export function vtWaitForHandles(handles: Set<VTHandle>, owners: Set<VTOwner> | null): boolean {
	const docs = vtDocumentsForOwners(owners);
	for (const handle of handles) {
		if (VT_WAITING_HANDLES.has(handle)) continue;
		VT_WAITING_HANDLES.add(handle);
		const done = (): void => {
			VT_WAITING_HANDLES.delete(handle);
			// Client sessions remove their own slots. External stream handles may
			// leave a fulfilled slot behind until their transport callback runs.
			for (const doc of docs) {
				if (doc.__octaneViewTransition === handle && VT_SESSIONS.get(doc)?.handle !== handle)
					doc.__octaneViewTransition = null;
				for (const [owner, scoped] of doc.__octaneViewTransitionScopes ?? [])
					if (scoped === handle && VT_SESSIONS.get(owner as VTOwner)?.handle !== handle)
						doc.__octaneViewTransitionScopes!.delete(owner);
			}
			vtScheduleQueuedWork();
		};
		handle.finished.then(done, done);
	}
	return handles.size > 0;
}

function vtInterruptOwners(owners: Set<VTOwner> | null, preparingOnly = false): void {
	// Before any participant is ready, the capture owns an indivisible commit.
	// Once one is ready, the commit landed even if sibling captures still prepare.
	const capture = VT_CAPTURE;
	if (capture !== null && !(preparingOnly && capture.committed)) capture.interrupt();
	const handles = vtActiveHandles(owners);
	let ready: VTSession[] | undefined;
	for (const session of VT_SESSIONS.values()) {
		if (!handles.has(session.handle)) continue;
		if (preparingOnly && session.release !== undefined) (ready ??= []).push(session);
		else session.interrupt?.();
	}
	let released = false;
	if (ready !== undefined) {
		// Restoring a receipt prepends its effects, so release later captures first.
		for (let i = ready.length - 1; i >= 0; i--) {
			const session = ready[i];
			handles.delete(session.handle);
			const release = session.release;
			if (release != null) {
				session.release = null;
				release();
				released = true;
			}
		}
	}
	for (const handle of handles) handle.skipTransition();
	if (released) vtDrainPassivesBeforeCapture();
}

/** Urgent work skips preparing captures but commits underneath running animations. */
export function vtInterruptPreparing(owners: Set<VTOwner> | null = null): void {
	vtInterruptOwners(owners, true);
}

function vtInterruptOwner(owner: VTOwner): void {
	vtInterruptOwners(new Set([owner]));
}

export function vtInterrupt(): void {
	vtInterruptOwners(null);
}

/**
 * Is this an animation-eligible transition batch? A pending cue renders urgently
 * (splitTransitionCue). A cue split from its block's waiting transition work
 * never is; a drain of other cues is only when transition work rides with them.
 */
export function queueAllTransition(): boolean {
	if (QUEUE.length === 0) return false;
	let cue = VT_ACTION_CUE;
	let work = false;
	for (let i = 0; i < QUEUE.length; i++) {
		const block = QUEUE[i];
		if (block.pendingMode !== 'transition') return false;
		if (queuedTransitionCue(block)) {
			if (TRANSITION_QUEUE.indexOf(block) !== -1) return false;
			cue = true;
		}
		if (!work && block.pending && !block.disposed) {
			const owner = block.idState.renderOwner;
			work =
				(block.kind === 'root' && !block.mounted) ||
				(owner?.request != null && owner.current !== null && QUEUE.includes(owner.current));
		}
	}
	if (!cue || work) return true;
	// The separate task queue can hold sibling work while this cue drains.
	// Only receipts belonging to this drain make the cue share a capture.
	for (const batch of FLUSHED_TRANSITION_BATCHES) {
		if (!transitionBatchReady(batch)) continue;
		for (const block of batch.blocks) {
			if (!block.disposed && block.pending && QUEUE.includes(block)) return true;
		}
	}
	return false;
}

export function queuedTransitionCue(block: Block): boolean {
	return !!TRANSITION_ROOT_DRIVER && TRANSITION_ROOT_DRIVER.splitsCue(block);
}

export function vtHasActiveHandles(): boolean {
	if (VT_SESSIONS.size > 0) return true;
	if (typeof document === 'undefined') return false;
	const doc = document as VTDocument;
	return doc.__octaneViewTransition != null || (doc.__octaneViewTransitionScopes?.size ?? 0) > 0;
}

export function vtNativeAvailable(owners: Set<VTOwner> | null): boolean {
	if (typeof document !== 'undefined' && (document as VTDocument).startViewTransition !== undefined)
		return true;
	if (owners !== null)
		for (const owner of owners) if (owner.startViewTransition !== undefined) return true;
	return false;
}

/** Whether act's synchronous loop can start a capture without waiting for native work. */
export function vtWouldWrap(): boolean {
	if (VT_CAPTURE !== null || (hydrating && CURSOR !== null) || !queueAllTransition()) return false;
	if (!vtHasActiveHandles() && vtNativeAvailable(null)) return true;
	const owners = vtQueuedOwners();
	return vtNativeAvailable(owners) && vtActiveHandles(owners).size === 0;
}

/** Settle passives from nested sync commits before choosing capture priority and owners. */
export function vtDrainPassivesBeforeCapture(): boolean {
	let passes = 0;
	while (effectQueues[PASSIVE].length > 0 || pendingPassiveUnmounts.length > 0) {
		if (DEFERRED_LAYOUT_DRIVER && DEFERRED_LAYOUT_DRIVER.holdPassivesBeforeRender()) return true;
		// A long cascade keeps normal commit scheduling without retaining a stale
		// animation batch. Ordinary passive effects still retain their yield policy.
		if (passes++ === LAYOUT_CASCADE_LIMIT) return false;
		drainPassiveEffects();
	}
	return true;
}

/** Names and activation relays never cross a native capture owner. */
function vtCheckNames(group: VtGroup): void {
	if (process.env.NODE_ENV === 'production') return;
	const names = new Map<string, Element>();
	for (const rec of group.recs)
		for (const el of rec.els) {
			const name = (el as HTMLElement).style?.getPropertyValue('view-transition-name');
			if (!name || name === 'none' || name === 'auto') continue;
			const other = names.get(name);
			if (other !== undefined && other !== el && !group.warnedNames.has(name)) {
				group.warnedNames.add(name);
				console.error(
					'Two ViewTransition boundaries use the same name in one capture: ' +
						name +
						'. Give simultaneously visible boundaries distinct names.',
				);
			}
			names.set(name, el);
		}
}

export function vtPrepareGroup(group: VtGroup, types: string[]): void {
	const { recs, records, planned, visibleBefore } = group;
	const appearing = new Set<string>();
	for (const [block, props] of planned) {
		if (!visibleBefore.has(block) && props?.name != null && props.name !== 'auto')
			appearing.add(props.name);
	}
	for (const rec of recs) {
		let cls: string;
		if (planned.has(rec.block)) {
			// The new update prop controls BOTH captures, including a nested
			// update="none" that must remain part of its parent's old snapshot.
			cls = vtResolveClass(planned.get(rec.block)!, 'update', types);
		} else if (rec.props?.name != null && appearing.has(rec.props.name)) {
			cls = vtResolveClass(rec.props, 'share', types);
		} else {
			const ancestor = vtNearestBoundaryAncestor(rec.block);
			const nestedExit = ancestor !== null && visibleBefore.has(ancestor) && !planned.has(ancestor);
			if (!nestedExit) cls = vtResolveClass(rec.props, 'exit', types);
			else {
				const outer = vtRelayOutermost(
					rec.block,
					'parent-exit',
					(block) => visibleBefore.has(block) && !planned.has(block),
					types,
				);
				const outerRec = outer === null ? undefined : records.get(outer);
				const outerShared = outerRec?.props?.name != null && appearing.has(outerRec.props.name);
				cls =
					outerRec !== undefined &&
					!outerShared &&
					vtAnyInViewport(outerRec.rects) &&
					vtResolveClass(outerRec.props, 'exit', types) !== 'none' &&
					vtRelayHasClass(rec.props, 'parent-exit')
						? vtResolveClass(rec.props, 'parent-exit', types)
						: 'none';
			}
		}
		if (cls !== 'none' && vtAnyInViewport(rec.rects)) {
			rec.oldCaptured = true;
			vtApplyStyles(rec, cls);
		}
	}
	vtCheckNames(group);
}

export function vtFinalizeGroup(group: VtGroup, types: string[]): void {
	const { recs, records, styles, visibleBefore, acts, animations: cancelledAnimations } = group;
	const owner = vtOwnerDocument(group.owner);
	const visibleAfter = new Set<Block>();
	const entered = new Set<Block>();
	const changed = new Set<Block>();
	for (const block of VT_REGISTRY) {
		if (block.disposed || vtScopeForBlock(block) !== group.owner) continue;
		const els = vtCaptureElements(block, group.owner);
		if (els.length === 0) continue;
		visibleAfter.add(block);
		let rec = records.get(block);
		if (rec === undefined) {
			rec = vtCreateRecord(block, els, styles);
			rec.nextRects = rec.rects;
			rec.rects = [];
			rec.oldName = '';
			recs.push(rec);
			records.set(block, rec);
			entered.add(block);
		} else {
			const previousEls = rec.els;
			rec.els = els;
			rec.props = vtProps(block);
			rec.name = vtGetName(block, rec.props);
			rec.nextRects = vtMeasureElements(els, true);
			if (VT_DIRTY.has(block) || vtElsChanged(previousEls, els) || vtRectChanged(rec))
				changed.add(block);
		}
	}
	const exited = (block: Block): boolean => visibleBefore.has(block) && !visibleAfter.has(block);
	const active = new Set<Block>();
	const shared = new Set<Block>();
	const newClasses = new Map<Block, string>();
	const pairedCandidates = new Set<Block>();
	// Include named descendants inside entering units before deciding which
	// unpaired boundaries receive ordinary enter callbacks.
	const appearingNames = new Map<string, VtRec>();
	for (const block of entered) {
		const rec = records.get(block)!;
		const name = rec.props?.name;
		if (name != null && name !== 'auto') appearingNames.set(name, rec);
	}
	for (const rec of recs) {
		if (!exited(rec.block)) continue;
		const name = rec.props?.name;
		const pair = name != null && name !== 'auto' ? appearingNames.get(name) : undefined;
		if (pair === undefined) continue;
		pairedCandidates.add(rec.block);
		appearingNames.delete(name!);
		if (vtResolveClass(rec.props, 'share', types) === 'none' || !vtAnyInViewport(rec.rects))
			continue;
		shared.add(rec.block);
		shared.add(pair.block);
		active.add(rec.block);
		acts.push({ kind: 'share', rec });
		const cls = vtResolveClass(pair.props, 'share', types);
		if (cls !== 'none' && vtAnyInViewport(pair.nextRects!)) {
			newClasses.set(pair.block, cls);
			active.add(pair.block);
		}
	}
	for (const rec of recs) {
		const block = rec.block;
		if (shared.has(block)) continue;
		if (exited(block)) {
			if (pairedCandidates.has(block)) continue;
			const ancestor = vtNearestBoundaryAncestor(block);
			if (ancestor !== null && exited(ancestor)) continue;
			if (vtResolveClass(rec.props, 'exit', types) !== 'none' && vtAnyInViewport(rec.rects)) {
				active.add(block);
				acts.push({ kind: 'exit', rec });
			}
		} else if (entered.has(block)) {
			const ancestor = vtNearestBoundaryAncestor(block);
			if (ancestor !== null && entered.has(ancestor)) continue;
			const cls = vtResolveClass(rec.props, 'enter', types);
			if (cls !== 'none' && vtAnyInViewport(rec.nextRects!)) {
				active.add(block);
				newClasses.set(block, cls);
				acts.push({ kind: 'enter', rec });
			}
		}
	}
	// A clipping ancestor must participate when a child changes even if its
	// own rectangle is unchanged. Geometry was measured for every host.
	for (const item of recs) {
		const block = item.block;
		if (!changed.has(block) && !active.has(block)) continue;
		for (
			let ancestor = vtNearestBoundaryAncestor(block);
			ancestor !== null;
			ancestor = vtNearestBoundaryAncestor(ancestor)
		) {
			const rec = records.get(ancestor);
			if (
				visibleBefore.has(ancestor) &&
				visibleAfter.has(ancestor) &&
				rec?.nextRects?.some((r) => r.clip)
			)
				changed.add(ancestor);
		}
	}
	for (const block of changed) {
		const rec = records.get(block)!;
		if (rec.name === 'none' && rec.owner === rec.els[0]) continue;
		const cls = vtResolveClass(rec.props, 'update', types);
		if (cls !== 'none' && (vtAnyInViewport(rec.rects) || vtAnyInViewport(rec.nextRects!))) {
			active.add(block);
			newClasses.set(block, cls);
			acts.push({ kind: 'update', rec });
		}
	}
	for (const rec of recs) {
		const block = rec.block;
		if (shared.has(block)) continue;
		const kind = exited(block) ? 'parent-exit' : entered.has(block) ? 'parent-enter' : null;
		if (kind === null || !vtRelayParticipates(rec.props, kind)) continue;
		const outer = vtRelayOutermost(
			block,
			kind,
			kind === 'parent-exit' ? exited : (b) => entered.has(b),
			types,
		);
		if (outer === null || shared.has(outer) || !active.has(outer)) continue;
		if (vtRelayHasClass(rec.props, kind)) {
			const cls = vtResolveClass(rec.props, kind, types);
			if (cls === 'none') continue;
			active.add(block);
			if (kind === 'parent-enter') newClasses.set(block, cls);
		}
		acts.push({ kind, rec });
	}
	// Apply only resolved new captures. Suppressed or unchanged boundaries
	// stay part of their surrounding snapshot instead of animating separately.
	for (const rec of recs) {
		const cls = newClasses.get(rec.block);
		if (cls !== undefined) vtApplyStyles(rec, cls);
	}
	for (const rec of recs) {
		if (!rec.oldCaptured || active.has(rec.block)) continue;
		// Native scope roots retain self-participation and clipping even when
		// only a descendant boundary activates in this capture.
		if (rec.owner?.nodeType === 1 && rec.els[0] === rec.owner) continue;
		let ancestor = vtNearestBoundaryAncestor(rec.block);
		while (ancestor !== null && !active.has(ancestor))
			ancestor = vtNearestBoundaryAncestor(ancestor);
		if (ancestor === null) vtCancelOldCapture(rec, cancelledAnimations);
		// An unchanged boundary inside an animating ancestor keeps its name on the
		// new side too (React parity), so its old snapshot never plays alone over
		// the ancestor's new snapshot, which already paints the same element.
		else if (visibleAfter.has(rec.block))
			vtApplyStyles(rec, vtResolveClass(rec.props, 'update', types));
	}
	vtCheckNames(group);
	const root = owner.documentElement;
	if (
		group.owner.nodeType === 9 &&
		root.style.getPropertyValue('view-transition-name') === '' &&
		typeof root.animate === 'function'
	) {
		root.style.setProperty('view-transition-name', 'none');
		group.restoreRoot = () => {
			if (root.style.getPropertyValue('view-transition-name') === 'none')
				root.style.removeProperty('view-transition-name');
		};
		cancelledAnimations.push(
			root.animate(
				{ opacity: [0, 0], pointerEvents: ['none', 'none'] },
				{ duration: 0, fill: 'forwards', pseudoElement: '::view-transition-group(root)' },
			),
		);
		cancelledAnimations.push(
			root.animate(
				{ width: [0, 0], height: [0, 0] },
				{ duration: 0, fill: 'forwards', pseudoElement: '::view-transition' },
			),
		);
	}
	if (acts.length === 0) {
		group.skipRequested = true;
		group.handle?.skipTransition();
	}
}

/** What a held commit removes and inserts, read before it lands (vtFlush). */
interface VtPreview {
	leaving: Set<Node>;
	arrivals: Array<{ parent: Node; anchor: Node | null; nodes: Node }>;
}

export function vtPreview(held: RootRenderTransaction[]): VtPreview {
	const leaving = new Set<Node>();
	const arrivals: VtPreview['arrivals'] = [];
	const range = (first: Node | null, last: Node | null): void => {
		for (let node = first; node !== null; node = getNextSibling(node)) {
			leaving.add(node);
			if (node === last) break;
		}
	};
	for (const transaction of held) {
		if (transaction.retired !== null)
			for (const block of transaction.retired)
				if (block.startMarker !== null) range(block.startMarker, block.endMarker);
		const ops = transaction.ops;
		for (let i = 0; i < ops.length; i += 2) {
			const kind = ops[i];
			const target = ops[i + 1];
			if (kind === applyOutgoing) {
				range(target[1], target[2]);
				continue;
			}
			const next: SlotNext | null = kind === applySlotNext ? target.next : null;
			if (next === null) continue;
			const out = next.out;
			for (let j = 0; j < out.length; j += 3) {
				const entry = out[j];
				if (entry === placeRun)
					arrivals.push({ parent: next.parent!, anchor: out[j + 2], nodes: out[j + 1] });
				else if (entry === placeRoots)
					for (const row of out[j + 1] as Block[])
						arrivals.push({ parent: next.parent!, anchor: out[j + 2], nodes: row.startMarker! });
				else if (entry !== moveBlockBefore) range(out[j + 1], out[j + 2]);
			}
			const nodes = next.root ?? (next.members !== null ? next.frag : null);
			if (nodes !== null && next.parent !== null)
				arrivals.push({
					parent: next.parent,
					anchor: next.follows && out.length !== 0 ? out[out.length - 2] : next.before,
					nodes,
				});
		}
	}
	return { leaving, arrivals };
}

export function vtLeaving(node: Node, preview: VtPreview): boolean {
	for (let current: Node | null = node; current !== null; current = current.parentNode)
		if (preview.leaving.has(current)) return true;
	return false;
}

/** vtCaptureElements once the held commit lands: without what leaves, with what arrives. */
export function vtPendingCaptureElements(
	block: Block,
	owner: VTOwner,
	preview: VtPreview,
): Element[] {
	const els = vtRangeElements(block).filter((element) => !vtLeaving(element, preview));
	if (!inInactiveSubtree(block)) {
		const start = block.startMarker;
		const end = block.endMarker;
		for (const arrival of preview.arrivals) {
			if (start === null || end === null) {
				if (arrival.parent !== block.parentNode) continue;
			} else {
				if (arrival.parent !== start.parentNode || arrival.anchor === null) continue;
				let inside = false;
				for (let node = getNextSibling(start); node !== null; node = getNextSibling(node)) {
					if (node === arrival.anchor) inside = true;
					if (inside || node === end) break;
				}
				if (!inside) continue;
			}
			const nodes = arrival.nodes;
			if (nodes.nodeType === 11) {
				for (let node = getFirstChild(nodes); node !== null; node = getNextSibling(node))
					if (node.nodeType === 1 && vtHostVisible(node as Element)) els.push(node as Element);
			} else if (nodes.nodeType === 1 && vtHostVisible(nodes as Element))
				els.push(nodes as Element);
		}
	}
	return els.filter((element) => {
		const nearest = vtClosestScope(element);
		return owner.nodeType === 9 ? nearest === null : nearest === owner;
	});
}

/**
 * `<ViewTransition>` — a transparent boundary that opts its subtree into
 * browser View Transitions on transition-lane commits (enter on insert, exit
 * on delete, update on inner mutation — see the View Transitions block above
 * and docs/view-transitions-plan.md). Renders its children unchanged; all
 * animation machinery lives in the flush controller. Boundary-flagged like
 * Suspense/ErrorBoundary (M3 inherit-decline), so its block always owns an
 * exact DOM range without ordinary component slots retaining its implementation.
 */
export function initializeViewTransitionComponent(): ComponentBody<ViewTransitionProps> {
	return markComponentFlags<ComponentBody<ViewTransitionProps>>(
		function ViewTransition(props, scope) {
			const block = scope.block;
			ensureViewTransitionDriver().renderBoundary(block, props);
			childSlot(scope, 0, block.parentNode, props.children, block.endMarker);
			vtPrepareScopeBoundary(block);
			if (props.ref != null) {
				const target = vtScopeForBlock(block);
				const instance =
					props.scope === 'element' &&
					(props.name == null || props.name === 'auto') &&
					target?.nodeType === 1
						? vtScopeRefInstance(block, target as Element)
						: vtGetInstance(block, undefined, target);
				const ref = props.ref;
				// A boundary ref follows its layout lifetime, including retained
				// Activity hiding and Suspense disconnect/reconnect. Conditional
				// slot deactivation also detaches a ref removed from the props.
				useLayoutEffect(
					() => {
						applyRefValue(ref, instance);
						return () => applyRefValue(ref, null, instance);
					},
					[ref, instance],
					VT_REF_SLOT,
				);
			}
		},
		COMPONENT_FLAG_BOUNDARY,
		'ViewTransition',
	);
}
