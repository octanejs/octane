// Descriptor renderer
//
// The runtime de-opt renderer for markup produced at runtime: descriptor
// reconciliation, keyed descriptor children and host component descriptors.

import { replaceSharedBlockBoundary, removeAfter } from './branches.js';
import { hydrating } from '../hydration-flag.js';
import { hasOwnProp } from '../has-own.js';
import { childrenIterator, textareaChildText } from '../shared-value-helpers.js';
import { __profileCount, ProfileCounter } from '../profiling.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { ELEMENT_TAG, PORTAL_TAG } from '../runtime-tags.js';
import type {
	ComponentBody,
	Scope,
	Block,
	RootRenderTransaction,
	SlotNext,
	ElementDescriptor,
	ChildSlot,
} from './types.js';
import { queueRefAttach } from './drivers.js';
import { renderBlock } from './signal-owners.js';
import { queueRefDetach, type FragmentInstance, mountFragmentRef } from './refs.js';
import {
	ROOT_RENDER_ROLLBACK,
	journalRootProperty,
	retireRootBlock,
	renderingFocus,
	captureFocusedMovement,
	retireEventHostTree,
} from './engine.js';
import { SKIPPED_ROW_REFRESH } from './context.js';
import {
	HYDRATION_PASS,
	CURSOR,
	isRendererHydrationStyle,
	type HydrationCapability,
	isTextSeparator,
} from './hydration.js';
import {
	ScopeImpl,
	createBlock,
	renderReturnedValue,
	disposeReturnSlot,
	unmountBlock,
	registerSlot,
} from './block.js';
import {
	CURRENT_BLOCK,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_DEPTH,
	ROOT_RENDER_TRANSACTION,
	ROOT_DISCARD_STAMP,
	commitInScope,
	updateDeoptComponent,
} from './render.js';
import { isDocumentSingleton } from './roots.js';
import { setEventHandler } from './hydration-presentation.js';
import { pendingWrites } from './signal-bindings.js';
import {
	updateTextValue,
	dangerHtmlChildrenError,
	validateDangerouslySetInnerHTMLValue,
	HTML_NS,
	isHtmlCustomElement,
	isHostElementOfType,
	inferTagNs,
	deoptChildNamespace,
	setAttribute,
	setClassAttr,
	setStyle,
	removeHostProp,
	formActionAttributeName,
	DESCRIPTOR_HOST,
	setHostProps,
	DESCRIPTOR_FORM_ACTION,
	enableDescriptorFormActions,
} from './host-props.js';
import {
	Fragment,
	activityDescriptorDispatch,
	ELEMENTS_MISSING_LIST_KEY,
	SCOPED_CHILDREN_RESOLVER,
	type OctaneNode,
	SCOPED_VALUE_RECORD,
	type ScopedValueDescriptor,
	isElementDescriptor,
	isHostDescriptor,
	invalidChildError,
} from './elements.js';
import { siteLoc } from './diagnostics.js';
import {
	sameRenderBody,
	type CompSlot,
	componentSlot,
	clearChildContent,
} from './component-slots.js';
import { childSlot, childTextHole } from './child-slots.js';
import { detachDeoptTreeRefs } from './activity.js';
import {
	type ForSlot,
	depsEqual,
	readListKey,
	mountItemsLinear,
	reconcileKeyed,
	batchClearItems,
	moveBlockBefore,
	moveFocusedNodeBefore,
} from './lists.js';
import {
	JOURNAL_PROP,
	slotNext,
	slotFrontier,
	queueFrontier,
	usesFrontier,
	placeAtCommit,
	markerParent,
	discardMarker,
	queueRootDeletion,
	journalBag,
	journalObjectOnce,
} from './commit.js';
import { getFirstChild, getNextSibling, rejectTextareaChild } from './templates.js';
import {
	eventSlot,
	devEventListener,
	_delegated,
	_delegatedCapture,
	delegateEvents,
	delegateCaptureEvents,
} from './events.js';
import {
	queueDevFormDiagnostic,
	DEFAULT_CHECKED_INITIALIZED,
	isControlledHostProp,
} from './forms.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// ---------------------------------------------------------------------------
// Runtime de-opt renderer — renders dynamically-produced markup that appears at
// a VALUE position: host JSX returned from a `.map(...)` callback or a function,
// an array of elements (incl. one passed through props), or a lone host
// descriptor. The compiled-template path stays the fast path; this is the sound
// fallback React-shaped code relies on (we can't statically prove `items.map` is
// a list, and arrays arrive via many non-`.map` paths).
//
// Host elements are RECONCILED in place across re-renders (reconcileDeoptNode):
// same-tag elements are reused — props patched, children matched by key/position —
// so DOM-resident state (input value, focus, selection, scroll, media) survives.
// `@for (...; key ...)` remains the compiled fast path. Component descriptors in
// this path are rendered via real Blocks (hostElementBody / the childSlot component
// path) so their hooks/state reconcile too.
// ---------------------------------------------------------------------------

// React dedupes missing-key diagnostics by render owner/source. Octane does not
// carry owner stacks, so use the closest durable equivalent: once per rendering
// Block. This avoids both global suppression (one list hiding every later bug)
// and repeated warnings from updates of the same component instance.
const DEOPT_KEY_WARNED_BLOCKS = new WeakSet<object>();
let DEOPT_KEY_WARNED_WITHOUT_BLOCK = false;
export function warnMissingListKey(owner: Block | null): void {
	const warned =
		owner === null ? DEOPT_KEY_WARNED_WITHOUT_BLOCK : DEOPT_KEY_WARNED_BLOCKS.has(owner as object);
	if (!warned) {
		if (owner === null) DEOPT_KEY_WARNED_WITHOUT_BLOCK = true;
		else DEOPT_KEY_WARNED_BLOCKS.add(owner as object);
		console.warn(
			'Octane: each element in an array child should have a unique "key" prop ' +
				'(e.g. `items.map((x) => <li key={x.id}>…</li>)`). Missing keys can reconcile ' +
				'incorrectly on reorder — for keyed lists prefer ' +
				'`@for (...; key ...)`.',
		);
	}
}

// The key an element or portal list item carries, or null when the item falls
// back to its index. Each field read of a scoped JSX value resolves its record
// again, so the key is read once. `warnMissing` is set for runtime-built arrays,
// which React expects to be keyed; positional children never warn.
function ownListKey(item: any, warnMissing: boolean): any {
	if (item == null) return null;
	const kind = item.$$kind;
	if (kind !== ELEMENT_TAG && kind !== PORTAL_TAG) return null;
	const key = item.key;
	// React parity: unkeyed array children fall back to the index, with a deduplicated
	// dev warning. Only ELEMENTS need keys: empty slots, primitives, and nested
	// iterables are legal list members and must not produce a missing-key warning.
	// (Suppressed during hydration adoption — markers drive matching.)
	if (
		process.env.NODE_ENV !== 'production' &&
		warnMissing &&
		kind === ELEMENT_TAG &&
		(key == null || ELEMENTS_MISSING_LIST_KEY.has(item)) &&
		(!hydrating || CURSOR === null)
	) {
		warnMissingListKey(CURRENT_BLOCK);
	}
	return key != null ? key : null;
}

// `createElement(tag, props, a, b, …)` collapses MULTIPLE positional children into a
// fresh array. Those are FIXED siblings (they never reorder), so the de-opt list keys
// them by index SILENTLY — unlike a `.map()` result, where a missing key is a real
// reorder hazard worth warning about. createElement tags its positional arrays in
// this set so childSlot can key them without the missing-key warning.
export const POSITIONAL_CHILDREN = new WeakSet<object>();

// Compiler contract: a VALUE-position JSX fragment (`<>…</>` in `.tsx` bodies,
// and every MDX document root) lowers to an array literal — FIXED siblings in
// source order, i.e. React's "static children" (`jsxs`), which React never
// key-warns. The compiler wraps that literal in this tag so the de-opt list
// keys it by index silently, exactly like `createElement`'s positional-children
// arrays above. Tagged at ANY length (a fragment's lone unkeyed child — or an
// interleaved text item like MDX's `"\n"`, which can never carry a key — must
// not warn either); only runtime-built arrays (`.map()` results, arrays through
// props) keep the warning.
export function positionalChildren(children: any[]): any[] {
	POSITIONAL_CHILDREN.add(children);
	return children;
}

// Whether ANY de-opt descriptor carrying a `ref` was ever stamped (monotone).
// Gates every detachDeoptTreeRefs walk: an app that never puts a ref on a
// de-opt element never pays the per-DOM-node descriptor scan on teardown.
export let DEOPT_REFS_STAMPED = false;

// Record a stamped de-opt ref on its owner block and every ancestor, so the
// teardown walk over any enclosing `deoptNode` region knows refs may be below.
// The early exit bounds repeat stamping: the chain above the first flagged
// block is already flagged.
export function noteDeoptRef(block: Block): void {
	DEOPT_REFS_STAMPED = true;
	let b: Block | null = block;
	while (b !== null && !b.deoptRefs) {
		b.deoptRefs = true;
		b = b.parentBlock;
	}
}

// React contract: `dangerouslySetInnerHTML` and `children` are mutually exclusive —
// the raw HTML owns the element's content. When present, the de-opt paths must SKIP
// child reconciliation entirely: setHostProps already wrote
// `el.innerHTML`, and running childSlot/reconcileDeoptChildren with (empty) children
// would wipe it. (SSR already implements raw-HTML-wins; see runtime.server.ts.)
// Supplying BOTH is a programming error — throw like React (silently letting the
// raw HTML win would hide the author's dead `children`).
function hasDangerHTML(props: any): boolean {
	if (props == null || props.dangerouslySetInnerHTML == null) return false;
	validateDangerouslySetInnerHTMLValue(props.dangerouslySetInnerHTML);
	if (props.children != null) {
		throw dangerHtmlChildrenError();
	}
	return true;
}

// Form-control props own a textarea's text/reset baseline just as raw HTML
// owns ordinary host content. Empty descriptor children must not erase it.
function hasHostPropContent(descriptor: ElementDescriptor): boolean {
	return (
		hasDangerHTML(descriptor.props) ||
		(isTextareaTag(descriptor.type as string) &&
			(descriptor.props?.value != null || descriptor.props?.defaultValue != null))
	);
}

export function markInputCheckedness(input: HTMLInputElement): void {
	// React initializes even an input with no checked/defaultChecked prop. Mark
	// its live property dirty so a baseline added on a reused host stays a reset
	// target rather than changing the user's current choice.
	input.checked = input.checked;
	(input as any)[DEFAULT_CHECKED_INITIALIZED] = true;
}

interface HostComponentSlot {
	el: Element;
	/** Legacy child anchor — null since the owns-parent childSlot (M2). */
	anchor: Comment | null;
	ref: any;
	// The props applied last render — diffed against the next render so props/events that
	// DISAPPEARED get removed (not left stale on the reused element).
	props: any;
	// Dedicated sub-scope holding the children's childSlot (slot 0), so the children
	// reconcile/unmount via the Block tree without stamping a derived key on `scope`.
	childScope: Scope | undefined;
	/** A root render's props for this committed host, applied by its commit entry. */
	next: any[] | null;
}

// Render a host element (`<tag>`) that WRAPS a children render-body, from runtime
// (non-template) code — e.g. a `motion.div` proxy component that the compiler
// invokes via componentSlot. The element is created ONCE (held in `scope.slots[slot]`),
// its props are re-applied on every render (reactive className / style / events /
// attributes / ref), and the children body renders INSIDE it via childSlot. The
// element node is returned so the caller can drive imperative work against it
// (animations, gesture listeners, measurements). This is the runtime counterpart
// of the compiled `<tag …>{children}</tag>` host emission.
export function hostComponent(
	scope: Scope,
	slot: number,
	tag: string,
	props: Record<string, any> | null,
	// A compiled TSRX call site passes its children render-body; a TSX/createElement
	// value position passes a descriptor. `OctaneNode` is the alias for "whatever a
	// hole may render", and covers both — see the branch below.
	childrenBody?: ComponentBody | OctaneNode,
	anchor?: Node | null,
): Element {
	const block = scope.block;
	let state = scope.slots[slot] as HostComponentSlot | undefined;
	if (state === undefined) {
		// Its props are arbitrary, so any of them can be a function form action.
		enableDescriptorFormActions();
		// `motion.circle` and friends: inherit the destination's namespace, as
		// hostStringTagBody does for a component tag that resolves to a host string.
		const elNs = inferTagNs(tag, deoptChildNamespace(block.parentNode));
		const el =
			elNs !== undefined ? document.createElementNS(elNs, tag) : document.createElement(tag);
		// A root render that drops forgets the host it created with it, unless
		// it discards the whole Block.
		if (
			ROOT_RENDER_TRANSACTION !== null &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || block.createdStamp !== ROOT_DISCARD_STAMP)
		) {
			journalRootProperty(scope.slots, slot, undefined);
			if (scope.children === null) journalRootProperty(scope, 'children', null);
			else journalObjectOnce(scope.children);
			if (scope.cleanups === null) journalRootProperty(scope, 'cleanups', null);
			else journalObjectOnce(scope.cleanups);
		}
		// The children childSlot exclusively OWNS `el`'s content (owns-parent
		// mode) — no `<!---->` insertion anchor needed (marker-elision M2).
		state = {
			el,
			anchor: null,
			ref: undefined,
			props: undefined,
			childScope: undefined,
			next: null,
		};
		scope.slots[slot] = state;
		// Children render into a dedicated sub-scope (registered on `scope.children` so
		// unmountScope walks into it), keeping the children's slot off `scope` itself.
		const childScope = new ScopeImpl(scope, block);
		state.childScope = childScope;
		(scope.children ??= []).push({
			key: slot,
			scope: childScope,
			at: scope._slots === null ? 0 : scope._slots.length,
		});
		// Under a committed Block, the new host lands at commit, from a frontier.
		const parent = block.parentNode;
		const before = anchor ?? block.endMarker;
		if (usesFrontier(block, parent)) {
			const frag = queueFrontier(block, parent, before);
			frag.appendChild(el);
		} else parent.insertBefore(el, before);
		(scope.cleanups ??= []).push(() => {
			state!.next = null;
			queueRefDetach(state!.ref, state!.el);
		});
	}
	const el = state.el;
	// A committed host takes its props at commit, after its children's entries.
	let next: any[] | null = null;
	if (state.props !== undefined && usesFrontier(block, el)) next = [state, props, scope];
	else applyHostProps(state, props, scope);
	if (childrenBody != null || state.childScope!.slots[0] !== undefined) {
		// Tagged bodies carry source identity and ownership through to childSlot;
		// a delegating wrapper would hide both. Descriptor callers also already
		// supply a renderable value, so reconcile it directly.
		//
		// A TSX value position can go null between renders (`{cond ? <x/> : null}`),
		// unlike the compiled TSRX body which is statically present or absent. Once
		// the slot exists it must keep receiving the value — including null — or the
		// previous Block and its DOM stay stranded inside the host (hostElementBody
		// reconciles unconditionally for the same reason). A host that never had
		// children stays out of childSlot: under hydration `ownsHost` is ignored, so
		// an unconditional call would mint a stray end marker inside every childless
		// host component.
		childSlot(state.childScope!, 0, el, childrenBody ?? null, null, false, el);
	}
	if (next !== null) {
		journalRootProperty(state, 'next', state.next);
		state.next = next;
		ROOT_RENDER_TRANSACTION!.ops.push(commitHostComponent, next);
	}
	return el;
}

function commitHostComponent(next: any[]): void {
	const state: HostComponentSlot = next[0];
	// A later pass of this render, or the host's unmount, superseded it.
	if (state.next !== next) return;
	state.next = null;
	commitInScope(next[2], applyHostProps, state, next[1]);
}

// Props for a PERSISTENT runtime host (hostComponent), re-applied each render. Unlike
// setHostProps' identity diff, an unchanged prop is re-asserted against the live
// target (foreign edits and mutable values included), while the ref is attached once
// and only re-attached when it changes.
function applyHostProps(state: HostComponentSlot, props: any, scope: Scope): void {
	const el = state.el;
	const prev = state.props;
	const compareLive =
		prev !== undefined && (!hydrating || CURSOR === null) && !isHtmlCustomElement(el);
	let needsCheckedInitialization = prev === undefined && el.localName === 'input';
	if (ROOT_RENDER_TRANSACTION !== null && prev !== props) journalObjectOnce(state);
	// REMOVE props/events present last render but gone now, via the shared removeHostProp
	// (parity with setHostProps) — a reused element must not keep stale
	// props/listeners. `ref` stays here (not in removeHostProp) because this path also
	// clears the persistent `state.ref` alongside the detach.
	if (prev != null) {
		for (const k in prev) {
			if (k === 'key' || k === 'children') continue;
			if (props != null && k in props) continue;
			if (k === 'ref') {
				if (prev.ref != null) {
					queueRefDetach(prev.ref, el);
					if (state.ref === prev.ref) state.ref = undefined;
				}
				continue;
			}
			removeHostProp(el, k, prev[k]);
		}
	}
	state.props = props;
	if (props == null) {
		if (needsCheckedInitialization) markInputCheckedness(el as HTMLInputElement);
		if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, scope);
		return;
	}
	for (const name in props) {
		if (name === 'key' || name === 'children') continue;
		const v = props[name];
		if (
			needsCheckedInitialization &&
			(name === 'defaultChecked' || (name === 'checked' && v != null))
		)
			needsCheckedInitialization = false;
		const actionName = formActionAttributeName(el, name);
		if (actionName !== null) {
			DESCRIPTOR_FORM_ACTION(el, actionName, v, prev?.[name]);
			continue;
		}
		if (name === 'suppressHydrationWarning') {
			(el as any).__oct_suppress = v === true;
			continue;
		}
		if (name === 'ref') {
			if (v !== state.ref) {
				// Detach + attach both land at commit (detaches drain first), so a
				// ref hopping between elements in one render cycles old → null → new
				// regardless of which element's props apply first (React's
				// mutation→layout phasing; see queueRefDetach).
				if (state.ref != null) queueRefDetach(state.ref, el);
				if (v != null) queueRefAttach(scope, v, el);
				state.ref = v;
			}
		} else if (name === 'className' || name === 'class') {
			// Compare the current target, not a same-named previous prop: another
			// alias can have won or disappeared, and foreign code can edit the DOM.
			// Mutable class arrays/objects still pass through normalization.
			if (!compareLive || typeof v !== 'string' || el.getAttribute('class') !== v) {
				setClassAttr(el, v);
			}
		} else if (name === 'style') {
			setStyle(el as HTMLElement, v, prev != null ? prev.style : undefined);
		} else {
			// Use `eventSlot` (NOT a hand-rolled `on<Upper>` parse) so capture-phase handlers
			// resolve to the CAPTURE key + register a capture-phase listener — `onClickCapture`
			// was previously mis-delegated as a bubbling `clickcapture` event.
			const ev = eventSlot(name, el);
			if (ev) {
				if (ev.capture) {
					if (!_delegatedCapture.has(ev.type)) delegateCaptureEvents([ev.type]);
				} else if (!_delegated.has(ev.type)) {
					delegateEvents([ev.type]);
				}
				const handler = process.env.NODE_ENV !== 'production' ? devEventListener(name, v) : v;
				if (!compareLive || (el as any)[ev.key] !== handler) setEventHandler(el, ev.key, handler);
			} else if (prev === undefined || name !== 'autoFocus' || isHtmlCustomElement(el)) {
				// These string attributes have no coercion, property projection, or
				// URL policy. Matching live values need neither a write nor an undo
				// snapshot. The remaining attributes retain their complete setter.
				if (
					compareLive &&
					(process.env.NODE_ENV === 'production' || (el as any).__oct_loc === undefined) &&
					typeof v === 'string' &&
					(name === 'id' ||
						name === 'title' ||
						name === 'role' ||
						name === 'for' ||
						name === 'htmlFor' ||
						name.startsWith('data-') ||
						name.startsWith('aria-')) &&
					el.getAttribute(name === 'htmlFor' ? 'for' : name) === v
				)
					continue;
				setAttribute(el, name, v);
			}
		}
	}
	if (needsCheckedInitialization) markInputCheckedness(el as HTMLInputElement);
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, scope);
}

// The descriptor that last produced a de-opt host element is stashed on the element
// as a typed expando, so a re-render can diff props (setHostProps) and match
// children by key against the live DOM — WITHOUT rebuilding, which would destroy
// DOM-resident state (input value, focus, selection, scroll, media). A direct
// property (not a WeakMap) keeps the per-child lookup in reconcileDeoptChildren cheap;
// `DeoptStamped` types it so there's no `any`. Absent on text/adopted server nodes.
export const DEOPT_DESC: unique symbol = Symbol('octane.deoptDesc');

// Whether any of `el`'s current children were created by the de-opt reconciler. Every node it
// builds carries a `$$deoptKey` stamp (or a descriptor), so ownership is derivable and needs no
// per-element bookkeeping — which keeps it off the reconcile hot path and off the DOM node's shape.
// React only manages children it created, so an element holding nothing but foreign DOM (a
// `replaceChildren` into an element we rendered empty, a third-party widget) must be left alone.
// Portal ranges already get that treatment via `$$portalEnd`; this covers the imperative case.
function hasDeoptOwnedChild(el: Element): boolean {
	let n: Node | null = getFirstChild(el);
	while (n !== null) {
		// Skip foreign `<!--portal-->…<!--/portal-->` ranges exactly as the removal walk does.
		// Their contents are stamped, but they belong to the portal, so counting them would make
		// an element that merely hosts a portal look owned and expose its other children.
		const rangeEnd = (n as any).$$portalEnd as Node | undefined;
		if (rangeEnd != null) {
			n = nodeAfterPortalRange(n, rangeEnd);
			continue;
		}
		if ((n as any).$$deoptKey !== undefined || getDeoptDesc(n) !== undefined) return true;
		n = getNextSibling(n);
	}
	return false;
}
interface DeoptStamped {
	[DEOPT_DESC]?: ElementDescriptor;
}
// A render reads the record an earlier pass of the same root render left
// pending (DeoptOrder): that is what its commit will show.
export function getDeoptDesc(n: Node): ElementDescriptor | undefined {
	const order = pendingDeoptOrder(n);
	if (order !== null && order.desc !== null) return order.desc;
	return (n as Node & DeoptStamped)[DEOPT_DESC];
}
function sameDeoptDesc(
	previous: ElementDescriptor | undefined,
	next: ElementDescriptor,
	children: unknown,
): boolean {
	return (
		previous !== undefined &&
		previous.type === next.type &&
		previous.props === next.props &&
		previous.key === next.key &&
		previous.ref === next.ref &&
		previous.children === children
	);
}

export function unchangedScopedHostDescriptor(block: Block, d: ElementDescriptor): boolean {
	const resolve = (d as ScopedValueDescriptor<any>)[SCOPED_VALUE_RECORD];
	if (resolve === undefined && (d as any)[SCOPED_CHILDREN_RESOLVER] === undefined) return true;
	const next = resolve === undefined ? d : resolve();
	const previous = block.deoptNode === null ? undefined : getDeoptDesc(block.deoptNode);
	return previous === next || sameDeoptDesc(previous, next, next.children);
}

function setDeoptDesc(el: Element, d: ElementDescriptor): void {
	stampDeoptDesc(el, deoptRecord(el, d));
}

// The record to commit for `d`, resolved in render. A deferred JSX shell can
// resolve differently after a Provider update; stamping the shell itself would
// make both sides of the next prop diff observe the new record and would run
// user code outside render while Suspense detaches subtree refs.
function deoptRecord(el: Element, d: ElementDescriptor): ElementDescriptor {
	const resolveScopedRecord = (d as ScopedValueDescriptor<any>)[SCOPED_VALUE_RECORD];
	const record = resolveScopedRecord === undefined ? d : resolveScopedRecord();
	if ((record as any)[SCOPED_CHILDREN_RESOLVER] === undefined) return record;
	// A deferred-children shell is stable across different resolved trees too.
	// Retain the actual children used by this host so a later raw-host upgrade
	// can match the old DOM, without resolving its old keys in the new scope.
	const children = record.children;
	const previous = getDeoptDesc(el);
	return sameDeoptDesc(previous, record, children)
		? previous!
		: {
				$$kind: ELEMENT_TAG,
				type: record.type,
				props: record.props,
				key: record.key,
				ref: record.ref,
				children,
			};
}

function stampDeoptDesc(el: Element, record: ElementDescriptor): void {
	const host = el as Element & DeoptStamped;
	// A held descriptor retry restores host props too. Restore their comparison
	// record with them or the final retry will mistake aborted props for live ones.
	if (TRANSITION_JOURNAL !== null)
		TRANSITION_JOURNAL.push(JOURNAL_PROP, el, DEOPT_DESC, host[DEOPT_DESC]);
	host[DEOPT_DESC] = record;
}

type DeoptWrapperKind = 'array' | 'fragment';

interface PreparedDeoptList {
	items: any[];
	keys: any[];
}

function isFragmentDescriptor(value: any): value is ElementDescriptor {
	return isElementDescriptor(value) && value.type === Fragment;
}

function fragmentDescriptorChildren(value: ElementDescriptor): any[] {
	const children = value.children;
	if (children == null) return [];
	return Array.isArray(children) ? children : [children];
}

// A ref-bearing Fragment descriptor exists only when an element factory that
// could carry the ref created it: public createElement, createElementAt, or
// cloneElement, or compiled JSX that gives a Fragment (or a dynamic tag) a
// `ref` or a spread. Those install the boundary here, so other bundles do not
// retain FragmentInstance through the generic child renderer. A compiler
// classification gap leaves it null, and the call throws.
let DESCRIPTOR_FRAGMENT_REF: typeof fragmentRefDescriptor | null = null;

/** @internal Installed by every element factory that can give a Fragment a ref. */
export function enableDescriptorFragmentRefs(): void {
	DESCRIPTOR_FRAGMENT_REF = fragmentRefDescriptor;
}

/** Preserve a ref-bearing public Fragment descriptor as a real lifecycle boundary. */
function fragmentRefDescriptor(value: ElementDescriptor): ElementDescriptor<ElementDescriptor> {
	return {
		$$kind: ELEMENT_TAG,
		type: renderFragmentRefDescriptor,
		props: value,
		key: value.key,
		ref: null,
		children: null,
	};
}

/** Cold component body for a ref-bearing Fragment. */
export function renderFragmentRefDescriptor(
	descriptor: Pick<ElementDescriptor, 'ref' | 'children'>,
	scope: Scope,
): void {
	const block = scope.block;
	let instance = block.slots[1] as FragmentInstance | undefined;
	if (instance === undefined) {
		const hydration = hydrating ? CURSOR : null;
		let start: Comment;
		let end: Comment;
		const opening = hydration?.node;
		if (opening?.nodeType === 8 && (opening as Comment).data === 'frag') {
			start = opening as Comment;
			let depth = 1;
			let cursor: Node | null = getNextSibling(start);
			while (cursor !== null) {
				if (cursor.nodeType === 8) {
					if ((cursor as Comment).data === 'frag') depth++;
					else if ((cursor as Comment).data === '/frag' && --depth === 0) break;
				}
				cursor = getNextSibling(cursor);
			}
			if (cursor === null) throw new Error(formatClientError(50));
			end = cursor as Comment;
			hydration!.node = getNextSibling(start);
		} else {
			start = document.createComment('frag');
			end = document.createComment('/frag');
			block.parentNode.insertBefore(start, block.endMarker);
			block.parentNode.insertBefore(end, block.endMarker);
		}
		instance = mountFragmentRef(scope, start, end, descriptor.ref);
		block.slots[0] = { a: instance };
		block.slots[1] = instance;
		block.refFields = ['f', 'a', ''];
	} else if (instance._currentRef !== descriptor.ref) {
		journalRootProperty(instance, '_currentRef', (instance as any)._currentRef);
		if (instance._currentRef != null) queueRefDetach(instance._currentRef, instance);
		if (descriptor.ref != null) queueRefAttach(scope, descriptor.ref, instance);
		instance._currentRef = descriptor.ref;
	}

	childSlot(scope, 2, block.parentNode, descriptor.children, instance._endMarker);
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) hydration.node = getNextSibling(instance._endMarker);
}

function deoptWrapperKind(value: any[]): DeoptWrapperKind {
	return POSITIONAL_CHILDREN.has(value as object) ? 'fragment' : 'array';
}

const DEOPT_KEY_STRINGIFY = JSON.stringify;
const DEOPT_KEY_STRING = String;

function nestedDeoptKeyPrefix(path: readonly (string | number)[]): string | null {
	// Object-valued wrapper keys and custom array serialization may differ for
	// each leaf. Keep their existing full-key serialization path.
	if (JSON.stringify !== DEOPT_KEY_STRINGIFY || 'toJSON' in path) return null;
	for (let i = 0; i < path.length; i++) {
		const type = typeof path[i];
		if (type !== 'string' && type !== 'number') return null;
	}
	return '[' + JSON.stringify(path) + ',';
}

function appendScopedDeoptKey(
	outKeys: any[],
	path: readonly (string | number)[],
	// ownListKey's result: null when the item carries no key.
	key: any,
	index: number,
	keyPrefix: string | null | undefined,
): string | null | undefined {
	// Reconciliation keys are internal: top-level implicit positions are numbers,
	// explicit keys carry a 'k' prefix, and nested paths are JSON strings. These
	// namespaces keep index 0 distinct from key="0" and user keys distinct from
	// nested wrapper paths without allocating a string for every unkeyed child.
	const explicit = key !== null;
	// The unwrapped top level — a plain children array or a single-layer Fragment,
	// which is what every `{items.map(...)}` list and every binding's rendered
	// output produces — is the hot path: it re-keys EVERY child on EVERY parent
	// render, including renders where all children go on to bail. Skip the
	// serializer there. JSON paths begin with '[', so they remain distinct from
	// explicit 'k' keys; numeric indices are distinct from both string forms.
	if (path.length === 0) {
		outKeys.push(explicit ? 'k' + String(key) : index);
		return keyPrefix;
	}
	// Only inert keys can share a wrapper prefix. Keep custom coercion on the
	// original expression below, including its serializer/callee lookup order.
	if (
		keyPrefix !== null &&
		(!explicit || (typeof key === 'string' && String === DEOPT_KEY_STRING)) &&
		JSON.stringify === DEOPT_KEY_STRINGIFY &&
		!('toJSON' in path)
	) {
		if (keyPrefix === undefined) keyPrefix = nestedDeoptKeyPrefix(path);
		if (keyPrefix !== null) {
			outKeys.push(
				explicit
					? keyPrefix + '"key",' + JSON.stringify(String(key)) + ']'
					: keyPrefix + '"index",' + index + ']',
			);
			return keyPrefix;
		}
	}
	outKeys.push(JSON.stringify([path, explicit ? 'key' : 'index', explicit ? String(key) : index]));
	// A custom serializer may retain or mutate this path, even if it restores
	// the built-ins before the next sibling. Never reuse its old prefix again.
	return null;
}

// Flatten arrays and Fragment descriptors to renderable leaves while retaining
// React's public state-preservation boundaries in their reconciliation keys.
// One top-level array/Fragment layer is transparent; a nested wrapper with the
// opposite kind is also transparent when it is the sole child. Equal adjacent
// wrappers form a real boundary. This is the observable rule behind React's
// single-child <-> Fragment/array preservation and its two-level remount cases.
function flattenReactChildContainer(
	outItems: any[],
	outKeys: any[],
	children: any[],
	kind: DeoptWrapperKind,
	path: readonly (string | number)[],
): void {
	const warnMissing = kind !== 'fragment';
	const count = children.length;
	let keyPrefix: string | null | undefined = count > 1 ? undefined : null;
	for (let i = 0; i < count; i++) {
		const item = children[i];
		if (isFragmentDescriptor(item)) {
			if (item.ref != null || hasOwnProp.call(item.props, 'ref')) {
				outItems.push(DESCRIPTOR_FRAGMENT_REF!(item));
				keyPrefix = appendScopedDeoptKey(
					outKeys,
					path,
					ownListKey(item, warnMissing),
					i,
					keyPrefix,
				);
				continue;
			}
			const nested = fragmentDescriptorChildren(item);
			const key = item.key;
			if (key != null) {
				flattenReactChildContainer(outItems, outKeys, nested, 'fragment', [
					...path,
					'keyed-fragment',
					key,
				]);
			} else {
				const nestedPath =
					kind === 'fragment'
						? [...path, 'wrapper', count === 1 ? 0 : i]
						: count === 1
							? path
							: [...path, 'position', i, 'fragment'];
				flattenReactChildContainer(outItems, outKeys, nested, 'fragment', nestedPath);
			}
			continue;
		}
		if (Array.isArray(item)) {
			const nestedKind = deoptWrapperKind(item);
			const nestedPath =
				nestedKind === kind
					? [...path, 'wrapper', count === 1 ? 0 : i]
					: count === 1
						? path
						: [...path, 'position', i, nestedKind];
			flattenReactChildContainer(outItems, outKeys, item, nestedKind, nestedPath);
			continue;
		}
		outItems.push(item);
		keyPrefix = appendScopedDeoptKey(outKeys, path, ownListKey(item, warnMissing), i, keyPrefix);
	}
}

function singleDeoptKey(item: any, key: any): string | number {
	return (isElementDescriptor(item) || item?.$$kind === PORTAL_TAG) && item.key != null
		? 'k' + String(key)
		: 0;
}

export function prepareDeoptList(
	value: any,
	forceSingle: boolean = false,
	includeKeyedSingle: boolean = true,
	// childSlot passes the element type it already read; undefined otherwise.
	elementType: unknown = isElementDescriptor(value) ? value.type : undefined,
): PreparedDeoptList | null {
	// childSlot calls this for EVERY renderable hole on every render, and the
	// non-list answer (a lone component descriptor, text, null) is the common one
	// — build the two output arrays only once a list regime is established.
	if (elementType === Fragment) {
		if (value.ref != null || hasOwnProp.call(value.props, 'ref')) {
			return {
				items: [DESCRIPTOR_FRAGMENT_REF!(value)],
				keys: [singleDeoptKey(value, value.key ?? 0)],
			};
		}
		const items: any[] = [];
		const keys: any[] = [];
		const key = value.key;
		const path = key == null ? [] : ['keyed-fragment', key];
		flattenReactChildContainer(items, keys, fragmentDescriptorChildren(value), 'fragment', path);
		return { items, keys };
	}
	if (Array.isArray(value)) {
		const items: any[] = [];
		const keys: any[] = [];
		flattenReactChildContainer(items, keys, value, deoptWrapperKind(value), []);
		return { items, keys };
	}
	if (includeKeyedSingle && isElementDescriptor(value)) {
		const key = value.key;
		if (key != null) return { items: [value], keys: ['k' + String(key)] };
	}
	if (forceSingle) {
		return { items: [value], keys: [singleDeoptKey(value, ownListKey(value, false) ?? 0)] };
	}
	return null;
}

export function iterableChildArray(value: any): any[] | null {
	if (
		value == null ||
		typeof value === 'string' ||
		Array.isArray(value) ||
		isElementDescriptor(value)
	)
		return null;
	const iterator = childrenIterator(value);
	if (iterator === null) return null;
	const out: any[] = [];
	const cursor = iterator.call(value);
	let step: IteratorResult<any>;
	while (!(step = cursor.next()).done) out.push(step.value);
	return out;
}

// Flatten a descriptor's `children` (a single value, or a possibly-nested array —
// `createElement` collapses positional children and `.map()` results into arrays)
// into a flat list of renderable values, dropping empties (null/undefined/false/
// true/'') which render nothing, with a parallel SLOT-SCOPED position key per kept
// child (React identity semantics, same compound scheme as flattenChildItemsKeyed):
// a child keeps its top-level position as its implicit key even when EMPTY
// siblings (`{cond && <input/>}` flipped off) render nothing — so a hole
// going falsy never shifts the following siblings onto different DOM nodes
// (the old compact-then-match-in-order behavior morphed them: inputs swapped
// values, a clicked button could morph into a submit button MID-DISPATCH and
// fire a phantom form submission). Nested arrays key within their slot;
// explicit keys ride inside the same scheme. Nested keys start with ':<index>'
// and end in distinct 'i' (index) and 'k' (explicit key) namespaces, so user keys
// cannot impersonate deeper wrappers. Top-level string keys starting with ':'
// escape it as '::'; ordinary flat keys keep their allocation-free path.
function flattenDeoptChildrenKeyed(outVals: any[], outKeys: any[], v: any, prefix: string): void {
	if (v == null || v === false || v === true || v === '') return;
	if (Array.isArray(v)) {
		const warnMissing = !POSITIONAL_CHILDREN.has(v);
		for (let i = 0; i < v.length; i++) {
			const item = v[i];
			if (Array.isArray(item)) {
				flattenDeoptChildrenKeyed(outVals, outKeys, item, prefix + ':' + i);
			} else if (item == null || item === false || item === true || item === '') {
				// empty — consumes its position, emits nothing
			} else {
				outVals.push(item);
				const k = ownListKey(item, warnMissing) ?? i;
				if (prefix === '') {
					outKeys.push(typeof k === 'string' && k[0] === ':' ? ':' + k : k);
				} else {
					const explicit = item?.$$kind === ELEMENT_TAG && item.key != null;
					outKeys.push(prefix + ':' + (explicit ? 'k' : 'i') + String(k));
				}
			}
		}
		return;
	}
	outVals.push(v);
	const k = v?.$$kind === ELEMENT_TAG && v.key != null ? v.key : 0;
	outKeys.push(
		prefix === '' ? (typeof k === 'string' && k[0] === ':' ? ':' + k : k) : prefix + ':i0',
	);
}

// Reconcile a runtime value into a DOM node, REUSING `prev` when it's compatible
// (same Text node, or same-tag element) so DOM-resident state survives a re-render.
// `prev` is the node currently occupying this position — pass the existing node to
// reuse/adopt it, or null to build fresh (first client mount). Pure host/text only:
// component descendants are handled by the Block path (hostElementBody/componentSlot),
// never here. Returns the node to occupy this position (reused or freshly built), or
// null for an empty value.
export function reconcileDeoptNode(
	prev: Node | null,
	value: any,
	ownerBlock: Block,
	ns?: string,
): Node | null {
	if (value == null || value === false || value === true || value === '') return null;
	const t = typeof value;
	if (t === 'string' || t === 'number' || t === 'bigint') {
		const s = String(value);
		if (prev !== null && prev.nodeType === 3 /* Text */) {
			const hydration = hydrating ? CURSOR : null;
			if (hydration !== null) {
				return hydration.htextSwap(prev, s);
			}
			if (usesFrontier(ownerBlock, prev)) queueDeoptText(prev as Text, s);
			else updateTextValue(prev as Text, s);
			return prev;
		}
		return document.createTextNode(s);
	}
	if (isHostDescriptor(value)) {
		// `<svg>` opens the SVG namespace; descendants inherit it (a `foreignObject`
		// switches ITS children back to HTML — see childNs below). SVG-ONLY tags
		// (`g`, `rect`, `path`, … — see SVG_ONLY_TAGS) imply it with no `<svg>`
		// ancestor. Without this the de-opt path's document.createElement would
		// mis-namespace SVG content (e.g. `<path>` returned from a component via
		// createElement, or portaled into an SVG target).
		const elNs = inferTagNs(value.type, ns);
		let el: Element;
		let defer = false;
		let pending: DeoptOrder | null = null;
		let desc: ElementDescriptor | null = null;
		let owner: Block | null = ownerBlock;
		if (
			prev !== null &&
			prev.nodeType === 1 &&
			isHostElementOfType(prev as Element, value.type) &&
			(prev as Element).namespaceURI === (elNs ?? HTML_NS)
		) {
			// REUSE the existing element — patch props in place instead of rebuilding.
			// Committed DOM takes the patch at commit, with its children's order.
			el = prev as Element;
			if (usesFrontier(ownerBlock, el)) {
				defer = true;
				pending = pendingDeoptOrder(el);
				desc = changedDeoptRecord(el, value, pending);
			} else {
				setHostProps(el, value.props, getDeoptDesc(el)?.props ?? null, ownerBlock, DESCRIPTOR_HOST);
				// Hydration orders an adopted host's children at commit, after what
				// its reconcile removes, and stamps its record there: an attempt that
				// never commits leaves the server node without one, so the next
				// attempt applies its props, ref included, as the first did.
				if (hydrating && CURSOR !== null && ROOT_RENDER_TRANSACTION !== null) {
					defer = true;
					desc = deoptRecord(el, value);
					owner = null;
				}
			}
		} else {
			// What hydration builds here, as in a `<noscript>` whose server content
			// is text, is client DOM: it builds with adoption suspended.
			const hydration = hydrating ? CURSOR : null;
			if (hydration !== null)
				return hydration.suspend(() => reconcileDeoptNode(null, value, ownerBlock, ns));
			el =
				elNs !== undefined
					? document.createElementNS(elNs, value.type)
					: document.createElement(value.type);
			setHostProps(el, value.props, undefined, ownerBlock, DESCRIPTOR_HOST);
		}
		if (desc === null) setDeoptDesc(el, value);
		const nodes = hasHostPropContent(value)
			? null
			: reconcileDeoptChildren(
					el,
					isHtmlTextareaType(value.type, elNs)
						? textareaChildText(value.children, rejectTextareaChild)
						: value.children,
					ownerBlock,
					defer,
					pending,
				);
		if (desc !== null || nodes !== null) queueDeoptOrder(el, owner, desc, nodes, null);
		return el;
	}
	// A component descriptor must not reach here — the de-opt callers gate on
	// descNeedsBlocks() and route component-bearing subtrees through Blocks.
	if (isElementDescriptor(value)) {
		throw new Error(formatClientError(25));
	}
	if (t === 'object') throw invalidChildError(value);
	return null;
}

// Reconcile a host element's children in place, reusing existing child nodes: keyed
// children match by `key`, unkeyed children match positionally (React-shape). Nodes
// not reused are removed; survivors are reordered to match the descriptor. No markers
// are introduced — the element fully owns its children, so this is raw-DOM reuse.
//
// A committed host's reconcile (`defer`) writes nothing: it returns the order
// its commit gives the children, or null when nothing can move them. An
// earlier pass of the same root render may have chosen them already: the
// pending record's `nodes`, not the DOM, are then the children it reconciles.
function reconcileDeoptChildren(
	el: Element,
	children: any,
	ownerBlock: Block,
	defer: boolean,
	pendingOrder: DeoptOrder | null,
): Node[] | null {
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.BLOCK_DEOPT);
	const pending = pendingOrder === null ? null : pendingOrder.nodes;
	const firstChild = pending === null ? getFirstChild(el) : null;
	// A scalar leaf keeps its sole owned Text node at the implicit first slot.
	// Other shapes still need keyed matching: a lone text node may belong to a
	// different array position, a nested wrapper, or independently inserted DOM.
	const type = typeof children;
	if ((type === 'string' && children !== '') || type === 'number' || type === 'bigint') {
		if (
			firstChild !== null &&
			firstChild.nodeType === 3 &&
			getNextSibling(firstChild) === null &&
			(firstChild as any).$$deoptKey === 0 &&
			(firstChild as any).$$portalEnd == null
		) {
			const hydration = hydrating ? CURSOR : null;
			if (hydration !== null) {
				hydration.htextSwap(firstChild, String(children));
			} else if (defer) {
				queueDeoptText(firstChild as Text, String(children));
			} else {
				updateTextValue(firstChild as Text, String(children));
			}
			return null;
		}
	}
	// Empty scalar children on an already empty host need no reconciliation
	// scratch arrays. Existing DOM must still take the ownership/clearing path.
	if (
		(children == null || type === 'boolean' || children === '') &&
		pending === null &&
		firstChild === null
	)
		return null;
	// The element that owns these children is authoritative. This matters when a
	// component or dynamic tag made the lexical namespace unknowable, and when an
	// SVG foreignObject resets its descendants to HTML.
	const childNs = deoptChildNamespace(el);
	const next: any[] = [];
	const nextKeys: any[] = [];
	flattenDeoptChildrenKeyed(next, nextKeys, children, '');
	const journal =
		ROOT_RENDER_TRANSACTION !== null &&
		el.parentNode !== null &&
		(ownerBlock.mounted ||
			ROOT_RENDER_TRANSACTION.hydrating ||
			ROOT_RENDER_TRANSACTION.retainedCreated?.has(ownerBlock));
	// Fresh element (first build / fresh client mount) — nothing to reconcile against,
	// so just build + append each child. Skips the keyed-match Map / Set / reorder
	// bookkeeping below, which is the hot path for large initial mounts.
	if (pending === null && firstChild === null) {
		// Hydrating, an adopted host with no server children cannot hold these.
		if (next.length !== 0 && hydrating) HYDRATION_PASS!.deoptMismatch(el, next[0]);
		const built: Node[] = [];
		for (let i = 0; i < next.length; i++) {
			const node = reconcileDeoptNode(null, next[i], ownerBlock, childNs);
			if (node !== null) {
				(node as any).$$deoptKey = nextKeys[i];
				if (defer) built.push(node);
				else el.appendChild(node);
			}
		}
		return built.length !== 0 ? built : null;
	}
	// Nothing to render, and we have never put children here: every node present came from
	// somewhere else, so leave it alone rather than reconciling against an empty list and
	// sweeping it away. (Going from rendered children to none still clears — the flag is set.)
	// Hydration is excluded: the children present are the server's, which this reconcile is
	// adopting, so a client descriptor that renders none must still clear them.
	if (
		next.length === 0 &&
		(!hydrating || CURSOR === null) &&
		(pending === null ? !hasDeoptOwnedChild(el) : pending.length === 0)
	) {
		return null;
	}
	// Collect only children this reconciler owns. Portal ranges and unstamped
	// imperatively streamed nodes may coexist with our children; neither belongs
	// to the descriptor and neither may be removed or positionally adopted.
	// Hydration is the sole exception: its unstamped server nodes are ours to
	// adopt. Check hydration lazily so already-stamped updates pay no extra cost.
	const owned: Node[] = [];
	let hasForeign = false;
	let hydrationOwnsUnstamped: boolean | undefined;
	let byKey: Map<any, Node> | null = null;
	const unstamped: Node[] = [];
	if (pending !== null) {
		// Every node an earlier pass chose is owned and carries its key.
		for (let i = 0; i < pending.length; i++) {
			const node = pending[i];
			const key = (node as any).$$deoptKey;
			owned.push(node);
			if (key != null && !(byKey ??= new Map()).has(key)) byKey.set(key, node);
			else unstamped.push(node);
		}
	}
	let scan: Node | null = firstChild;
	while (scan !== null) {
		const rangeEnd = (scan as any).$$portalEnd as Node | undefined;
		if (rangeEnd != null) {
			hasForeign = true;
			scan = nodeAfterPortalRange(scan, rangeEnd);
			continue;
		}
		const stampedKey = (scan as any).$$deoptKey;
		const descriptor = stampedKey === undefined ? getDeoptDesc(scan) : undefined;
		// A server separator between adjacent texts (ssrDescriptorContent) is not
		// adoptable content. Like the compiled path and React, hydration leaves it
		// in place and unreported; unstamped, it stays foreign to later reconciles.
		if (
			stampedKey === undefined &&
			descriptor === undefined &&
			(!(hydrationOwnsUnstamped ??= hydrating ? CURSOR !== null : false) || isTextSeparator(scan))
		) {
			hasForeign = true;
			scan = getNextSibling(scan);
			continue;
		}
		owned.push(scan);
		const key = stampedKey ?? descriptor?.key;
		if (key != null) {
			if (byKey === null) byKey = new Map();
			if (!byKey.has(key)) {
				byKey.set(key, scan);
				scan = getNextSibling(scan);
				continue;
			}
		}
		unstamped.push(scan);
		scan = getNextSibling(scan);
	}
	let up = 0;
	const result: Node[] = [];
	// The commit entries this host's children queue run before its own.
	const entries = defer ? ROOT_RENDER_TRANSACTION!.ops.length : 0;
	// Hydrating `<html>`, `<head>` or `<body>`, React skips server elements of
	// another tag, and comments, and leaves them, and what follows the client's
	// children, in place (HydrationCapability.skipForeign). Host descriptor
	// children render no range markers, so every comment here is foreign, and
	// isHostElementOfType matches no comment.
	const singleton = hydrating ? hydrationOwnsUnstamped === true && isDocumentSingleton(el) : false;
	for (let i = 0; i < next.length; i++) {
		const child = next[i];
		const key = nextKeys[i];
		let prev: Node | null = null;
		if (byKey !== null) {
			prev = byKey.get(key) ?? null;
			if (prev !== null) byKey.delete(key);
		}
		if (singleton && prev === null && isHostDescriptor(child)) {
			let at = up;
			while (
				at < unstamped.length &&
				unstamped[at].nodeType !== 3 &&
				!isHostElementOfType(unstamped[at] as Element, child.type)
			)
				at++;
			if (at < unstamped.length && unstamped[at].nodeType === 1) up = at;
			else if (up < unstamped.length)
				CURSOR!.fail(
					process.env.NODE_ENV !== 'production' ? (el as any).__oct_loc : undefined,
					() => `<${child.type as string}>`,
					unstamped[up],
				);
		}
		if (prev === null) {
			if (up < unstamped.length) prev = unstamped[up++];
			// The server rendered fewer children than the client.
			else if (hydrating && hydrationOwnsUnstamped === true && !singleton)
				HYDRATION_PASS!.deoptMismatch(el, child);
		}
		const node = reconcileDeoptNode(prev, child, ownerBlock, childNs);
		if (node !== null) {
			(node as any).$$deoptKey = key;
			result.push(node);
		}
	}
	// Remove OWNED children not reused (foreign portal ranges stay untouched).
	const keep = result.length > 0 ? new Set<Node>(result) : null;
	for (let i = owned.length - 1; i >= 0; i--) {
		const n = owned[i];
		if (keep === null || !keep.has(n)) {
			const hydration = hydrating ? CURSOR : null;
			if (singleton && (n as any).$$deoptKey === undefined) continue;
			// A server node that no client child adopted is content the client
			// renders nothing for.
			if (hydration !== null && (n as any).$$deoptKey === undefined)
				hydration.deoptMismatch(el, null, n);
			if (defer || journal) {
				queueRootDeletion(() => detachDeoptTreeRefs(n, null), n, n);
			} else {
				detachDeoptTreeRefs(n, null);
				el.removeChild(n);
			}
		}
	}
	if (defer) {
		// Children that keep their nodes and order need no placement, unless a
		// child queued a commit entry: that write can move the child (a custom
		// element's attribute callback reparents itself), and the order, which
		// runs after it, puts the child back where this host owns it.
		if (
			pending === null &&
			result.length === owned.length &&
			ROOT_RENDER_TRANSACTION!.ops.length === entries
		) {
			let i = 0;
			while (i < result.length && result[i] === owned[i]) i++;
			if (i === result.length) return null;
		}
		return result;
	}
	placeDeoptChildren(
		el,
		result,
		hasForeign || singleton,
		hydrationOwnsUnstamped === true && !singleton,
	);
	return null;
}

/**
 * A committed de-opt node's change in an open root render, written by its
 * commit entry (applyDeoptOrder) after the deletions its reconcile queued: a
 * host's descriptor (`desc`: its props and DEOPT_DESC record, applied in the
 * Scope `owner`, or only the record without one, for a host hydration adopted)
 * and its children's order (`nodes`), or a Text's `text`. Null
 * fields are unchanged. A later pass of the same render queues a new record,
 * which supersedes it; a window that drops forgets its records with its entries.
 */
interface DeoptOrder {
	tx: RootRenderTransaction;
	el: Node;
	nodes: Node[] | null;
	desc: ElementDescriptor | null;
	text: string | null;
	owner: Block | null;
}

/** The record an earlier pass of this root render left on `node`, if any. */
function pendingDeoptOrder(node: Node): DeoptOrder | null {
	const order: DeoptOrder | undefined = (node as any).$$deoptOrder;
	return order !== undefined && order.tx === ROOT_RENDER_TRANSACTION ? order : null;
}

/**
 * The record a committed host's patch commits, or null when its props would
 * write nothing (equal values, no controlled field to reassert): render then
 * stamps the record itself. A pending record is always superseded.
 */
function changedDeoptRecord(
	el: Element,
	d: ElementDescriptor,
	pending: DeoptOrder | null,
): ElementDescriptor | null {
	const prev = getDeoptDesc(el)?.props;
	const next = d.props;
	if (pending === null && prev != null && next != null) {
		let same = true;
		for (const k in next) {
			if (k !== 'key' && k !== 'children' && (next[k] !== prev[k] || isControlledHostProp(el, k))) {
				same = false;
				break;
			}
		}
		if (same && prev !== next)
			for (const k in prev)
				if (k !== 'key' && k !== 'children' && !(k in next)) {
					same = false;
					break;
				}
		if (same) return null;
	}
	return deoptRecord(el, d);
}

function queueDeoptOrder(
	node: Node,
	owner: Block | null,
	desc: ElementDescriptor | null,
	nodes: Node[] | null,
	text: string | null,
): void {
	const tx = ROOT_RENDER_TRANSACTION!;
	const order: DeoptOrder = { tx, el: node, nodes, desc, text, owner };
	journalRootProperty(node, '$$deoptOrder', (node as any).$$deoptOrder);
	(node as any).$$deoptOrder = order;
	tx.ops.push(applyDeoptOrder, order);
}

/** A committed Text's data, written at commit unless it already shows `data`. */
function queueDeoptText(node: Text, data: string): void {
	const pending = pendingDeoptOrder(node);
	if (data !== (pending !== null ? pending.text : node.nodeValue))
		queueDeoptOrder(node, null, null, null, data);
}

function applyDeoptOrder(order: DeoptOrder): void {
	const node = order.el as any;
	// A later pass of this render superseded it.
	if (node.$$deoptOrder !== order) return;
	node.$$deoptOrder = undefined;
	if (order.text !== null) {
		updateTextValue(node, order.text);
		return;
	}
	// A hydrated host applied its props in render and commits only its record.
	if (order.desc !== null) {
		if (order.owner === null) stampDeoptDesc(node, order.desc);
		else commitInScope(order.owner, commitDeoptHost, node, order.desc);
	}
	// Foreign ranges among the children stay where they are.
	if (order.nodes !== null) placeDeoptChildren(node, order.nodes, true, false);
}

function commitDeoptHost(el: Element, record: ElementDescriptor, owner: Scope): void {
	const committed = (el as DeoptStamped)[DEOPT_DESC];
	setHostProps(el, record.props, committed?.props ?? null, owner, DESCRIPTOR_HOST);
	stampDeoptDesc(el, record);
}

/**
 * Put a host's owned children in `result`'s order. Advance through owned live
 * children once. Indexed childNodes reads restart native list walks after each
 * insertion; foreign ranges also must not make every survivor rescan the
 * preceding siblings.
 */
function placeDeoptChildren(el: Element, result: Node[], skip: boolean, adopt: boolean): void {
	let cursor: Node | null = getFirstChild(el);
	for (let i = 0; i < result.length; i++) {
		const want = result[i];
		const at = skip ? nextDeoptOwnedChild(cursor, adopt) : cursor;
		if (at !== want) {
			if (renderingFocus === null) el.insertBefore(want, at);
			else {
				captureFocusedMovement(el, renderingFocus);
				moveFocusedNodeBefore(el, want, at, renderingFocus);
			}
		}
		// Focus-preserving moves can rotate surrounding siblings instead of
		// detaching want. Read its successor only after that movement completes.
		cursor = getNextSibling(want);
	}
}

// Resume point of an owned-children walk after a foreign portal range: the first
// node AFTER the range close (`end`). Tolerates a torn range (the close was removed
// out from under us) by resuming right after `start`, so the walk can never loop.
// Shared by reconcileDeoptChildren's ownership and ordering walks.
export function nodeAfterPortalRange(start: Node, end: Node): Node | null {
	let m: Node | null = start;
	while (m !== null && m !== end) m = getNextSibling(m);
	return getNextSibling(m ?? start);
}

// Continue an ordering walk past foreign portal ranges and imperative nodes.
// Hydration may also adopt unmarked server children in this owned host, except
// the server's text separators, which stay where they are.
function nextDeoptOwnedChild(scan: Node | null, adoptHydrationChildren: boolean): Node | null {
	while (scan !== null) {
		const rangeEnd = (scan as any).$$portalEnd as Node | undefined;
		if (rangeEnd != null) {
			scan = nodeAfterPortalRange(scan, rangeEnd);
			continue;
		}
		if (
			adoptHydrationChildren
				? isTextSeparator(scan)
				: (scan as any).$$deoptKey === undefined && getDeoptDesc(scan) === undefined
		) {
			scan = getNextSibling(scan);
			continue;
		}
		return scan;
	}
	return null;
}

// Marker-elision M4: a SELF-MARKED item (mounted while its value was a pure
// single-element host descriptor — startMarker === endMarker === that element,
// see mountItem's `2` sentinel) whose NEW value no longer fits one raw element
// (null / primitive / component-bearing) PROMOTES one-way to a real `it` pair
// minted around the current node, so the new content — and reorder/teardown —
// keep a live range after that node is retired. Client-only by construction
// (hydrated items always adopt the server's pair).
//
// A root render mints the pair off-document: its commit inserts it around the
// node, after the keyed list's own entry has moved that node, and only then
// re-points the item's markers (landItemPair). Until then the render builds
// against the pending pair (itemRange).
function promoteSelfMarkedItem(block: Block): void {
	const sm = block.startMarker;
	if (
		sm === null ||
		sm !== block.endMarker ||
		sm.nodeType === 8 /* COMMENT_NODE — i.e. already a pair */ ||
		sm.parentNode === null
	)
		return;
	// A render that dropped leaves its pair pending for the next one.
	let pair = PENDING_ITEM_PAIRS?.get(block);
	if (pair === undefined || pair[0] !== sm)
		pair = [sm, document.createComment('it'), document.createComment('/it'), block, null];
	if (!usesFrontier(block, sm.parentNode)) return landItemPair(pair);
	(PENDING_ITEM_PAIRS ??= new WeakMap()).set(block, pair);
	const transaction = ROOT_RENDER_TRANSACTION!;
	if (pair[4] !== transaction) {
		pair[4] = transaction;
		transaction.ops.push(landItemPair, pair);
	}
}

/** Self-marked items whose `it` pair a root render minted: [node, start, end, block, transaction]. */
let PENDING_ITEM_PAIRS: WeakMap<Block, any[]> | null = null;

/** The range an item renders into: its markers, or the pair its commit promotes it to. */
export function itemRange(block: Block): [Node | null, Node | null] {
	const pending = PENDING_ITEM_PAIRS?.get(block);
	return pending !== undefined && pending[0] === block.startMarker
		? [pending[1], pending[2]]
		: [block.startMarker, block.endMarker];
}

function landItemPair(pair: any[]): void {
	const [node, start, end, block] = pair as [Node, Comment, Comment, Block];
	if (PENDING_ITEM_PAIRS?.get(block) === pair) PENDING_ITEM_PAIRS.delete(block);
	const parent = node.parentNode;
	if (block.disposed || block.startMarker !== node || parent === null) return;
	parent.insertBefore(start, node);
	parent.insertBefore(end, node.nextSibling);
	block.startMarker = start;
	block.endMarker = end;
}

// `reconcileKeyed` item body for one de-opt array element. A pure host/text item
// is reconciled IN PLACE against the node from last render (`block.deoptNode`) —
// props patched, children matched — so host node identity and DOM-resident state
// (input value, focus, …) survive parent re-renders; only an incompatible node
// (tag/type change) is rebuilt. Component-bearing items delegate to a nested
// childSlot so their subtrees get real, reconcilable Blocks.
export function deoptItemBody(item: any, scope: Scope): void {
	const block = scope.block;
	const hydration = hydrating ? CURSOR : null;
	const existingChild = scope.slots[0] as ChildSlot | undefined;
	// Each field read of a scoped JSX value resolves its record again. A component
	// descriptor always needs Blocks, so it skips descNeedsBlocks' second read.
	const itemType = isElementDescriptor(item) ? item.type : undefined;
	const hostItem = typeof itemType === 'string';
	const needsBlocks =
		(hostItem &&
			existingChild?.__kind === 'childSlot' &&
			existingChild.currentComp === (hostElementBody as unknown as ComponentBody)) ||
		typeof itemType === 'function' ||
		descNeedsBlocks(item);
	if (needsBlocks || !hostItem) promoteSelfMarkedItem(block);
	const [itemStart, itemEnd] = itemRange(block);
	// An item whose subtree contains a COMPONENT descriptor (a bare `<Comp/>`, or a
	// host element with component children like `<li><Comp/></li>`) needs real Blocks
	// for hooks/reconciliation, which the raw host reconciler can't give it. Delegate to a
	// nested childSlot on this item's own scope: it owns a marker pair inside the
	// item's range and mounts the subtree as proper, reconciled child Blocks (the
	// host-with-components case lands on childSlot's reconciling host path). Pure
	// host/primitive items stay on the cheap rebuild path below. The two paths CAN
	// mix in one item — an UNKEYED `{cond ? <Comp/> : null}` sits at a stable index
	// key and flips between a component descriptor (Blocks) and null/text/pure-host
	// (raw) — so each branch tears down the other's residue on a switch (previously
	// the pure path left a toggled-off component's Blocks + DOM in the range forever).
	if (needsBlocks) {
		// Switching pure → Blocks. If the raw node the pure path left in the range
		// is a SAME-TAG element for the incoming host-with-components descriptor,
		// don't drop it — TRANSFER it to the nested childSlot as its pure-host
		// reuse candidate, so childSlot's pure-host → blocks upgrade branch adopts
		// the element (and, recursively, its children) in place. Anything else
		// (tag change, non-element, or an already-established nested slot) keeps
		// the old teardown.
		const stale = block.deoptNode;
		let transfer: Node | null = null;
		if (stale != null) {
			journalRootProperty(block, 'deoptNode', block.deoptNode);
			if (
				scope.slots[0] === undefined &&
				stale.nodeType === 1 /* Element */ &&
				hostItem &&
				isHostElementOfType(stale as Element, itemType as string) &&
				stale.parentNode === block.parentNode
			) {
				transfer = stale;
			} else if (stale.parentNode === block.parentNode) {
				if (ROOT_RENDER_TRANSACTION !== null) {
					queueRootDeletion(() => detachDeoptTreeRefs(stale, null), stale, stale);
				} else {
					detachDeoptTreeRefs(stale, null);
					const parent = block.parentNode;
					parent.removeChild(stale);
				}
			}
			block.deoptNode = null;
		}
		// Marker-elision M2: the nested childSlot BORROWS the item block's own
		// pair as its range instead of minting a second inner pair (end anchor +
		// lazy start) — the item's markers bound exactly the content this slot
		// manages. clearChildContent sweeps BETWEEN markers (never removes them),
		// and the item block still OWNS the pair (teardown removes it inclusive).
		// Only when the item is comment-marked. A component-bearing item never
		// delimits itself (selfDelimits), so on its first hydrating render the
		// pair is the server's one range for the item, which mountItem adopted
		// and the slot's first render claims (lentSlot). Above a passthrough
		// owner the item's pair is the client's (mountPassthroughListItem).
		const lent = hydration !== null && stale === null && !hydration.passthroughRanges;
		if (
			(hydration === null || lent) &&
			scope.slots[0] === undefined &&
			itemStart !== null &&
			itemEnd !== null &&
			itemStart !== itemEnd &&
			itemStart.nodeType === 8 /* COMMENT_NODE */ &&
			itemEnd.nodeType === 8
		) {
			const borrowed: ChildSlot = {
				__kind: 'childSlot',
				start: itemStart as Comment,
				end: itemEnd as Comment,
				ownerHost: null,
				borrowed: true,
				compactable: false,
				block: null,
				text: null,
				currentComp: null,
				currentIsBodyFn: false,
				forSlot: null,
				// Pure → Blocks transfer: the raw element becomes the slot's reuse
				// candidate — childSlot's upgrade branch adopts it in place.
				hostNode: transfer,
				portal: null,
				next: null,
				// childSlot's own slots carry this key; one shape for both.
				implicitSignal: undefined,
			};
			if (lent) hydration!.lentSlot = borrowed;
			scope.slots[0] = borrowed;
			registerSlot(scope, borrowed);
		} else if (transfer !== null && transfer.parentNode !== null) {
			// The borrowed-slot preconditions didn't hold (no marker pair) — the
			// transfer has no receiving slot; fall back to the old teardown.
			detachDeoptTreeRefs(transfer, null);
			const parent = transfer.parentNode!;
			parent.removeChild(transfer);
		}
		// The surrounding list already consumed this descriptor's key. Suppress
		// the keyed-single list normalization in the nested slot or the same
		// descriptor would recursively wrap itself forever.
		childSlot(scope, 0, block.parentNode, item, itemEnd, undefined, undefined, undefined, false);
		return;
	}
	// Switching Blocks → pure: unmount the childSlot content the Blocks path mounted
	// (effect cleanups + DOM) by reconciling it to null. Idempotent once cleared.
	if (
		scope.slots[0] !== undefined &&
		scope.slots[0] !== null &&
		(scope.slots[0] as any).__kind === 'childSlot'
	) {
		childSlot(scope, 0, block.parentNode, null, itemEnd);
	}
	// Pure host/text item → reconcile in place, REUSING the item's existing node so
	// DOM-resident state (input value, focus, …) survives a re-render. The reuse
	// candidate is the node from last render (block.deoptNode); on the very first
	// render under hydration it's instead the server node in the item range (adopt it).
	const endM = itemEnd;
	let prev = block.deoptNode;
	if (prev === null && hydration !== null) {
		const startM = itemStart;
		prev = startM != null ? getNextSibling(startM) : null;
		if (prev === endM) prev = null; // empty item range → nothing to adopt
	}
	const node = reconcileDeoptNode(prev, item, block, deoptChildNamespace(block.parentNode));
	if (node !== prev) {
		journalRootProperty(block, 'deoptNode', block.deoptNode);
		const parent = block.parentNode;
		const host = prev === null ? null : prev.parentNode;
		let landing: SlotNext | null = null;
		if (host !== null && host !== parent && (host as any).$$next !== undefined) {
			// An earlier pass of this render built `prev` in a frontier that has
			// not landed: replace it there, and land the replacement in its place.
			const retired = prev!;
			if (node !== null) host.replaceChild(node, retired);
			else host.removeChild(retired);
			queueRootDeletion(() => detachDeoptTreeRefs(retired, null), null, null);
			const bound = ((host as any).$$next as SlotNext).bound;
			if (bound !== null) bound[3] = bound[4] = node;
		} else {
			// Built a fresh node (first mount, or a tag/type change) — insert it at
			// the old node's position, THEN drop the old one. Insert-before-remove
			// matters for a SELF-MARKED item (M4): there `prev` IS the block's end
			// marker, so removing it first would leave `endM` detached and the
			// insert would throw. Committed DOM takes it at commit, from a frontier.
			const attached = host === parent;
			const frontier = usesFrontier(block, parent);
			if (node !== null) {
				const before = attached ? prev : endM;
				if (frontier) {
					const frag = queueFrontier(block, parent, before);
					frag.appendChild(node);
					landing = (frag as any).$$next;
				} else parent.insertBefore(node, before);
			}
			if (attached) {
				const retired = prev!;
				if (ROOT_RENDER_TRANSACTION !== null)
					queueRootDeletion(() => detachDeoptTreeRefs(retired, null), retired, retired);
				else {
					detachDeoptTreeRefs(retired, null);
					parent.removeChild(retired);
				}
			}
		}
		// Self-marked item rebuilt: the replaced element WAS the range — re-point
		// both markers at the replacement, as it lands when that is at commit.
		// The keyed list's own commit entry, which runs first, still moves or
		// removes the item by the node it shows now. (A non-host new value never
		// reaches here self-marked — the promotion above minted a pair first.)
		if (landing !== null && itemStart === prev) {
			landing.bound = [block, prev, prev, node, node];
		} else if (prev !== null && itemStart === prev) {
			journalRootProperty(block, 'startMarker', block.startMarker);
			journalRootProperty(block, 'endMarker', block.endMarker);
			block.startMarker = node;
			block.endMarker = node;
		}
	}
	block.deoptNode = node;
}

// Guarded native maps invoke componentSlot directly from their compiled item
// body. Keep that same slot ownership when a custom map returns the matching
// component descriptors, so switching dispatch modes preserves the component
// Block, its hooks/effects, and its DOM without aliasing it as a ChildSlot.
function mappedDeoptItemBody(item: any, scope: Scope): void {
	const state = scope.slots[0] as CompSlot | ChildSlot | undefined;
	const block = scope.block;
	if (isElementDescriptor(item) && typeof item.type === 'function') {
		if (state === undefined || state.__kind === 'componentSlotSlot') {
			const stale = block.deoptNode;
			let parent: Node = block.parentNode;
			// The item's node while the component renders off-document.
			let held: Node | null = null;
			if (stale !== null) {
				journalRootProperty(block, 'deoptNode', stale);
				block.deoptNode = null;
				const attached = stale.parentNode === parent;
				if (
					state === undefined &&
					attached &&
					block.startMarker === stale &&
					usesFrontier(block, parent)
				) {
					parent = itemComponentFrontier(block, stale);
					held = stale;
				} else {
					// A self-marked host node is the item's whole range; mint the pair
					// the component renders into before that node is retired.
					promoteSelfMarkedItem(block);
					if (attached && ROOT_RENDER_TRANSACTION !== null) {
						queueRootDeletion(() => detachDeoptTreeRefs(stale, null), stale, stale);
					} else {
						detachDeoptTreeRefs(stale, null);
						if (attached) parent.removeChild(stale);
					}
				}
			}
			try {
				// The server frames the compiled body's call inside the item's range,
				// which a hydrating call adopts instead of inheriting the item's.
				componentSlot(
					scope,
					0,
					parent,
					item.type,
					item.props,
					item.__octaneInvocationSite,
					itemRange(block)[1],
					true,
					hydrating ? CURSOR === null : true,
				);
			} finally {
				// Until its commit swaps the bound, the item's range is its node.
				if (held !== null) block.startMarker = block.endMarker = held;
			}
			return;
		}
	} else if (state?.__kind === 'componentSlotSlot') {
		// An exotic map may replace a keyed component with a host or empty value.
		// Preserve the item's boundaries before disposing its self-marked child;
		// the ordinary descriptor reconciler can then fill that same keyed range.
		promoteSelfMarkedItem(block);
		disposeReturnSlot(block, state);
		block.deoptNode = null;
	}
	deoptItemBody(item, scope);
}

/**
 * A self-marked item over committed DOM whose value becomes a component renders
 * it off-document, in a frontier between the `it` pair that its commit puts
 * where the host node stood, after the list has moved that node. The item's
 * markers name the pair for the component to inherit; the commit swaps them in
 * for good through the frontier's bound.
 */
function itemComponentFrontier(block: Block, stale: Node): DocumentFragment {
	const frag = queueFrontier(block, block.parentNode, null);
	const next: SlotNext = (frag as any).$$next;
	const start = document.createComment('it');
	const end = document.createComment('/it');
	frag.appendChild(start);
	frag.appendChild(end);
	next.follows = true;
	next.out.push(() => detachDeoptTreeRefs(stale, null), stale, stale);
	next.bound = [block, stale, stale, start, end];
	block.startMarker = start;
	block.endMarker = end;
	return frag;
}

// True when `value` (a descriptor, an array, or a primitive) contains a COMPONENT
// descriptor anywhere in its tree. Such a subtree can't be a raw host reconcile —
// its components need reconcilable, unmountable Blocks — so the de-opt
// paths (childSlot, deoptItemBody) route it through `hostElementBody`/componentSlot
// instead. Pure host/text subtrees return false and keep the cheap rebuild path.
export function descNeedsBlocks(value: any): boolean {
	// A render-FUNCTION child (the `.tsrx` lowering of `<Host>{children}</Host>` passes
	// `props.children` as a component body, not a descriptor) needs a Block: childSlot
	// renders a function value as a component. Without this a `.tsrx` consumer's children
	// reaching a `.ts` component's host element via createElement (e.g. FloatingOverlay's
	// `createElement('div', {children})`) would hit the raw reconciler, which renders a
	// function child as nothing.
	if (typeof value === 'function') return true;
	if (value == null || typeof value !== 'object') return false;
	// Thenables need a child slot so suspension and retries retain their host.
	if (typeof value.then === 'function') return true;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (descNeedsBlocks(value[i])) return true;
		}
		return false;
	}
	// A host descriptor can contain a re-iterable collection or a one-shot
	// iterator as its positional children. Route it through hostElementBody so
	// childSlot materializes the iterable exactly once and reconciles its values
	// as a keyed list. The raw host reconciler treats unknown objects as empty;
	// consuming here merely to inspect for component descendants would also
	// exhaust generators before the real render.
	if (!isElementDescriptor(value) && childrenIterator(value) !== null) return true;
	if (value.$$kind === ELEMENT_TAG) {
		// A Fragment descriptor is reconciled by childSlot's fragment-aware list
		// path. If it appears below a host descriptor, keep that host on the Block
		// path so the Fragment boundary is not mistaken for a raw host node.
		if (
			value.type === Fragment ||
			(activityDescriptorDispatch !== null && value.type === activityDescriptorDispatch.type)
		)
			return true;
		// A component descriptor (function `type`) always needs a Block; a host
		// descriptor needs one only if its own children do (recurse).
		return typeof value.type === 'function' || descNeedsBlocks(value.children);
	}
	// A portal descriptor renders into a foreign target via its own Block, so an
	// array containing one (e.g. `useDecorators()` returning an array of portals)
	// must route through childSlot, not the raw host reconciler.
	if (value.$$kind === PORTAL_TAG) return true;
	return false;
}

// An HTML tag name is ASCII case-insensitive (`createElement('TEXTAREA')` makes
// a textarea), and the server folds on the lowercased tag (ssrHostElement).
// Compare the string before paying for a DOM accessor on every de-opt host.
function isTextareaTag(type: string): boolean {
	return type === 'textarea' || (type.length === 8 && type.toLowerCase() === 'textarea');
}

function isHtmlTextareaType(type: string, elNs: string | undefined): boolean {
	return elNs === undefined && isTextareaTag(type);
}

// One childSlot renders a block-backed de-opt host's children into it. A
// <textarea>'s children are text instead, like a compiled one's (see
// textareaText): they fold to one string whose single Text node needs no slot
// or range marker, since the server serialized them as one text run inside
// RCDATA content (ssrHostElement). childTextHole adopts that text while
// hydrating (`adopt`) and otherwise updates the element's existing Text node.
function deoptHostChildren(
	block: Block,
	el: Element,
	d: ElementDescriptor,
	elNs: string | undefined,
	adopt = false,
): void {
	if (!isHtmlTextareaType(d.type as string, elNs)) {
		childSlot(block, 0, el, d.children, null, false, el);
		return;
	}
	const text = adopt ? null : getFirstChild(el);
	childTextHole(
		block,
		0,
		el,
		textareaChildText(d.children, rejectTextareaChild),
		text?.nodeType === 3 ? (text as Text) : null,
	);
}

// DEV: the source location of a runtime host's block. A createElement host has
// none of its own, so name the hole of the nearest compiled ancestor whose
// child slot renders it, or renders the runtime host that contains it.
function runtimeHostSiteLoc(block: Block): string {
	for (let child = block, scope = block.parentBlock; scope !== null; scope = scope.parentBlock) {
		const locs = scope.locs;
		if (locs !== undefined) {
			for (const key in locs) {
				if ((scope.slots[+key] as ChildSlot | undefined)?.block === child)
					return siteLoc(scope, +key);
			}
		}
		child = scope;
	}
	return '';
}

// The bodies of Blocks for one runtime host element, whose children its child
// slots render, recorded as they first render. A teardown that names them would
// keep the host renderers in every bundle that unmounts anything.
let HOST_ELEMENT_BODY: unknown;
let HOST_TAG_BODY: unknown;

export function isHostBlock(block: Block): boolean {
	const body = block.body as unknown;
	return body === HOST_ELEMENT_BODY || body === HOST_TAG_BODY;
}

// Stable render body for a HOST element produced via `createElement` (the de-opt
// path) whose subtree contains COMPONENT descriptors — e.g. a `.tsx` component that
// returns `<div className="n"><Node/><Node/></div>` from inside control flow (so the
// compiler emitted `createElement`, not a static template). It can't be a raw host
// reconcile because its component children need reconcilable Blocks.
//
// childSlot routes such a descriptor through the component path with THIS body as the
// (stable-identity) renderer, so it gets a real child Block that reconciles by body
// identity across renders and unmounts via the Block tree. The body builds/reuses its
// element (kept on its Block's typed `deoptNode` field), diffs props each render, and
// mounts its children through childSlot — giving each component child a proper Block.
// Element identity is preserved across re-renders, and nested host-with-components
// children recurse back through childSlot's host path.
export function hostElementBody(d: ElementDescriptor, block: Block): void {
	HOST_ELEMENT_BODY = hostElementBody;
	let el = block.deoptNode as Element | null;
	let desc: ElementDescriptor | null = null;
	const hydration = hydrating ? CURSOR : null;
	// Component/value boundaries are namespace-transparent. Derive the inherited
	// namespace from the block's actual DOM parent; explicit <svg>/<math> roots
	// still override it through inferTagNs.
	const elNs = inferTagNs(d.type as string, deoptChildNamespace(block.parentNode));
	// Hydration first render: ADOPT the server-rendered host element sitting at the
	// cursor instead of building a fresh one (which would orphan the server node and
	// desync the marker walk). Then point the cursor at its first child so the childSlot
	// below adopts the server-rendered children (which carry full childSlot markers when
	// they contain components — see the server's ssrHostElement). Pure-host children
	// have no inner markers, so childSlot's reconciling-host path rebuilds them in place.
	if (
		el === null &&
		hydration !== null &&
		hydration.node !== null &&
		hydration.node.nodeType === 1 &&
		isHostElementOfType(hydration.node as Element, d.type as string) &&
		(elNs === undefined || (hydration.node as Element).namespaceURI === elNs)
	) {
		el = hydration.node as Element;
		block.deoptNode = el;
		setHostProps(el, d.props, undefined, block, DESCRIPTOR_HOST);
		setDeoptDesc(el, d);
		const savedCursor = getNextSibling(hydration.node);
		if (!hasHostPropContent(d)) {
			hydration.node = getFirstChild(el);
			deoptHostChildren(block, el, d, elNs, true);
		}
		hydration.node = savedCursor;
		return;
	}
	if (el === null && hydration !== null) {
		// STRUCTURAL mismatch: the server rendered something other than this host element at
		// the cursor (different tag, a component's `<!--[-->…<!--]-->` range, text, …), or
		// nothing at all.
		hydration.fail(
			process.env.NODE_ENV !== 'production'
				? (hydration.node === null
						? (block.parentNode as any).__oct_loc
						: (hydration.node.parentNode as any)?.__oct_loc) || runtimeHostSiteLoc(block)
				: undefined,
			() => `<${String(d.type)}>`,
			hydration.node,
		);
	}
	if (
		el === null ||
		!isHostElementOfType(el, d.type as string) ||
		(elNs !== undefined && el.namespaceURI !== elNs)
	) {
		// First render, or the host tag changed at this slot — (re)create the element.
		// Committed DOM takes the replacement at commit, from a frontier.
		const parent = block.parentNode;
		const frontier = el !== null && usesFrontier(block, parent);
		if (el !== null) {
			const retired = el;
			journalRootProperty(block, 'deoptNode', block.deoptNode);
			// This Block keeps rendering, so the replaced element retires on its own,
			// before its children leave it and can take focus with them.
			if (ROOT_RENDER_TRANSACTION !== null)
				queueRootDeletion(() => retireEventHostTree(retired), null, null);
			else retireEventHostTree(retired);
			// The children slot's live content — markers included — sat inside the
			// removed element, so a preserved slot would keep rendering into the
			// detached node. Run the subtree's cleanups and drop the slot state so
			// the children REMOUNT into the fresh element: React parity, where a
			// host tag change remounts the entire subtree.
			const childState = block.slots[0] as ChildSlot | undefined;
			if (childState !== undefined) {
				disposeReturnSlot(block, childState);
			}
			const detach = () => {
				const ref = getDeoptDesc(retired)?.props?.ref;
				if (ref != null) queueRefDetach(ref, retired);
			};
			if (ROOT_RENDER_TRANSACTION !== null) queueRootDeletion(detach, retired, retired);
			else {
				detach();
				retired.remove();
			}
		}
		el =
			elNs !== undefined
				? document.createElementNS(elNs, d.type as string)
				: document.createElement(d.type as string);
		block.deoptNode = el;
		if (frontier) {
			const frag = queueFrontier(block, parent, block.endMarker);
			frag.appendChild(el);
		} else parent.insertBefore(el, block.endMarker);
		setHostProps(el, d.props, undefined, block, DESCRIPTOR_HOST);
	} else if (usesFrontier(block, el)) {
		// REUSE the committed element — its props change at commit, after its
		// children's entries. Its childSlot owns the children's structure.
		desc = changedDeoptRecord(el, d, pendingDeoptOrder(el));
	} else {
		// REUSE the existing element — diff props in place (no rebuild).
		setHostProps(el, d.props, getDeoptDesc(el)?.props ?? null, block, DESCRIPTOR_HOST);
	}
	if (desc === null) setDeoptDesc(el, d);
	// One childSlot renders all children INTO the element (append; no anchor): it
	// reconciles a single child (component/host/text) or an array (keyed list) and
	// recurses into nested host-with-components subtrees uniformly. Skipped when
	// dangerouslySetInnerHTML owns the content (see hasDangerHTML).
	if (!hasHostPropContent(d)) deoptHostChildren(block, el, d, elNs);
	if (desc !== null) queueDeoptOrder(el, block, desc, null, null);
}

// Stable render body for a componentSlot whose comp resolved to a HOST tag
// STRING at runtime (`<props.parts.title>` with parts.title === 'h1'; see the
// string-comp branch in componentSlot). The block's props is a host DESCRIPTOR:
// `d.type` the tag, `d.props` the raw call-site props, `d.children` the
// compiled `__children$N` render fn (or absent).
//
// DISTINCT from hostElementBody (the value-position de-opt renderer) because
// the CHILDREN CONVENTION differs: a template call site's children fn is the
// element's ENTIRE content and renders INLINE into the element — one Block
// whose range is all of `el`'s content, NO comment markers — matching the
// server's emission (ssrComponent's string branch inlines the fn's HTML like a
// static host tag; holes inside carry their own blocks). Value-position
// function children (via createElement) stay marker-wrapped in
// hostElementBody/childSlot, because the server block-wraps THOSE
// (ssrDescriptorContent's function branch) — each position's client/server
// pair stays aligned.
export function hostStringTagBody(d: ElementDescriptor, block: Block): void {
	HOST_TAG_BODY = hostStringTagBody;
	const tag = d.type as string;
	let el = block.deoptNode as Element | null;
	let desc: ElementDescriptor | null = null;
	const hydration = hydrating ? CURSOR : null;
	// Component tags can resolve to host strings under SVG/MathML. Inherit from
	// the actual destination rather than assuming every dynamic host is HTML.
	const elNs = inferTagNs(tag, deoptChildNamespace(block.parentNode));
	if (el === null) {
		if (
			hydration !== null &&
			hydration.node !== null &&
			hydration.node.nodeType === 1 &&
			isHostElementOfType(hydration.node as Element, tag) &&
			(elNs === undefined || (hydration.node as Element).namespaceURI === elNs)
		) {
			// Hydration first render: ADOPT the server-rendered element at the cursor,
			// then point the cursor at its first child so the children fn's clone()
			// adopts the server content DIRECTLY (it self-bounds on the element — the
			// server emitted no inner markers).
			el = hydration.node as Element;
			block.deoptNode = el;
			setHostProps(el, d.props, undefined, block, DESCRIPTOR_HOST);
			setDeoptDesc(el, d);
			const savedCursor = getNextSibling(hydration.node);
			if (!hasHostPropContent(d)) {
				hydration.node = getFirstChild(el);
				renderHostTagChildren(d, block, el);
			}
			hydration.node = savedCursor;
			return;
		}
		if (hydration !== null) {
			// STRUCTURAL mismatch, as in hostElementBody.
			hydration.fail(
				process.env.NODE_ENV !== 'production'
					? hydration.node === null
						? (block.parentNode as any).__oct_loc
						: (hydration.node.parentNode as any)?.__oct_loc
					: undefined,
				() => `<${tag}>`,
				hydration.node,
			);
		}
		// Client mount. (The tag is FIXED for this block's life — componentSlot
		// tears down + remounts on a tag change — so no localName re-check.)
		el = elNs !== undefined ? document.createElementNS(elNs, tag) : document.createElement(tag);
		block.deoptNode = el;
		const parent = block.parentNode;
		parent.insertBefore(el, block.endMarker);
		setHostProps(el, d.props, undefined, block, DESCRIPTOR_HOST);
	} else if (usesFrontier(block, el)) {
		// A committed element's props change at commit, after its children's
		// entries, as hostElementBody's do.
		desc = changedDeoptRecord(el, d, pendingDeoptOrder(el));
	} else {
		// Re-render, same tag — diff props in place against the stamped descriptor.
		setHostProps(el, d.props, getDeoptDesc(el)?.props ?? null, block, DESCRIPTOR_HOST);
	}
	if (desc === null) setDeoptDesc(el, d);
	if (!hasHostPropContent(d)) renderHostTagChildren(d, block, el);
	if (desc !== null) queueDeoptOrder(el, block, desc, null, null);
}

// Render a string-tag componentSlot's children into `el`. A FUNCTION child (the
// compiled `__children$N`, or a render prop) renders through ONE self-bounding
// Block whose range is all of `el`'s content — parentNode = el, no markers —
// reused across renders with the body swapped in place (the compiled closure is
// fresh each parent render but is the same slot child; mirrors childSlot's
// isBodyFn reconcile). A different compiled body token replaces that Block.
// A render prop that RETURNS a renderable instead of
// rendering imperatively is handled by renderBlock's return-slot (childSlot,
// marker-wrapped — matching the server's ssrChild normalization of a de-opt
// return). Non-function children (hand-rolled descriptors only; the compiler
// always passes a render fn or nothing) fall back to childSlot on their own
// slot index, which block-wraps exactly like the server's ssrHostElement
// content path for plain values.
function renderHostTagChildren(d: ElementDescriptor, block: Block, el: Element): void {
	const kids = d.children;
	if (kids == null) return;
	if (typeof kids === 'function') {
		const state = block.slots[0] as HostTagChildrenSlot | undefined;
		let child: Block;
		if (state === undefined) {
			child = hostTagChildrenBlock(block, el, kids);
			const slot: HostTagChildrenSlot = {
				__kind: 'hostTagChildrenSlot',
				block: child,
				next: null,
				incoming: null,
			};
			block.slots[0] = slot;
			// unmountScope's catch-all slot branch unmounts `slot.block`, firing the
			// children's cleanups; the DOM goes away with `el` (the block has no
			// markers of its own to sweep).
			registerSlot(block, slot);
		} else {
			// This render may already have replaced the Block (replaceHostTagChildren).
			const pending = state.next !== null && state.next.tx === ROOT_RENDER_TRANSACTION;
			child = pending ? state.incoming! : state.block;
			if (sameRenderBody(child.body, kids)) return renderWithBody(child, kids);
			child = replaceHostTagChildren(state, block, el, kids, pending);
		}
		renderBlock(child);
		return;
	}
	childSlot(block, 1, el, kids, null, false, el);
}

/**
 * Render `block` with `body`, a fresh capture of the authored body it holds.
 * A root render that can be dropped lands the body at its commit (landBody):
 * until then the Block keeps its committed body, so an update of its own
 * after a dropped render reads the committed captures.
 */
function renderWithBody(block: Block, body: ComponentBody): void {
	const committed = block.body;
	block.body = body;
	const transaction =
		committed === body || ROOT_RENDER_TRANSACTION === null ? null : pendingWrites(block);
	if (transaction === null) return renderBlock(block);
	try {
		renderBlock(block);
	} finally {
		block.body = committed;
	}
	transaction.ops.push(landBody, [block, body]);
}

function landBody(write: [Block, ComponentBody]): void {
	write[0].body = write[1];
}

/** A string-tag host's function children: one markerless Block owning all of the host's content. */
interface HostTagChildrenSlot {
	__kind: 'hostTagChildrenSlot';
	block: Block;
	/** Pending structure in the open root render (SlotNext). */
	next: SlotNext | null;
	/** The Block that render's commit puts in place of `block` (landHostTagChildren). */
	incoming: Block | null;
}

/**
 * A different authored body has a different slot layout, so it replaces the
 * children's Block (#2068). Over committed DOM the incoming Block builds in the
 * slot's frontier, and the commit unmounts the outgoing Block, removes its
 * nodes and lands the frontier; a dropped render leaves the committed Block.
 */
function replaceHostTagChildren(
	state: HostTagChildrenSlot,
	block: Block,
	el: Element,
	body: ComponentBody,
	pending: boolean,
): Block {
	if (!usesFrontier(block, el)) {
		unmountBlock(state.block, false);
		el.textContent = '';
		return (state.block = hostTagChildrenBlock(block, el, body));
	}
	if (pending) {
		// An earlier replacement in this render: its Block is still in the fragment.
		unmountBlock(state.incoming!, false);
		removeAfter(state.next!.frag!, null, null);
	} else {
		// The swap is the outgoing range's deletion cleanup, so it lands with the
		// slot's structure and drops with it (dropRootOps, dropBodyOps).
		retireRootBlock(state.block);
		slotNext(state).out.push(() => landHostTagChildren(state), getFirstChild(el), el.lastChild);
	}
	return (state.incoming = hostTagChildrenBlock(block, slotFrontier(state, block, el, null), body));
}

function hostTagChildrenBlock(block: Block, parent: Node, body: ComponentBody): Block {
	return createBlock(
		'dynamic',
		block,
		parent,
		null,
		null,
		body,
		{},
		undefined,
		renderReturnedValue,
	);
}

function landHostTagChildren(state: HostTagChildrenSlot): void {
	unmountBlock(state.block, false);
	state.block = state.incoming!;
	state.incoming = null;
}

// Tear down a childSlot's de-opt keyed list when the slot leaves array mode (a
// portal descriptor switches in, or the value stops being an array): unmount all
// items in one batched sweep and drop the list so a later array rebuilds fresh.
// (disposeReturnSlot has its own variant — it also unmounts @empty and skips the
// bookkeeping reset because the whole slot is being discarded.)
export function teardownChildForSlot(state: ChildSlot): void {
	const fs = state.forSlot!;
	batchClearItems(fs, fs.items);
	fs.head = null;
	fs.tail = null;
	fs.size = 0;
	state.forSlot = null;
}

/**
 * Whether childSlot's pure-host → blocks upgrade adopts `host` for `d`: the same
 * element type in the same namespace, with no raw HTML on either side.
 */
export function adoptsPureHost(host: Node, d: ElementDescriptor, domParent: Node): boolean {
	return (
		host.nodeType === 1 /* Element */ &&
		isElementDescriptor(d) &&
		typeof d.type === 'string' &&
		isHostElementOfType(host as Element, d.type) &&
		(host as Element).namespaceURI ===
			(inferTagNs(d.type, deoptChildNamespace(domParent)) ?? HTML_NS) &&
		!hasDangerHTML(d.props) &&
		!hasDangerHTML(getDeoptDesc(host)?.props ?? null)
	);
}

/** A markerless slot's pair, around the host it adopted: [host, start, end, parentBlock]. */
export function landHostPair(pair: any[]): void {
	const [host, start, end, parentBlock] = pair as [Node, Comment, Comment, Block];
	const parent = host.parentNode;
	if (parent === null) return;
	parent.insertBefore(start, host);
	parent.insertBefore(end, host.nextSibling);
	replaceSharedBlockBoundary(parentBlock, host, host, start, end);
}

// Only raw-host upgrades need this walk. The retained array structure supplies
// positional boundaries, while each raw node supplies its accepted descriptor:
// a deferred leaf's live key/type may already belong to the next Provider value.
function adoptedDeoptChildren(value: any, cursor: { node: Node | null }): any {
	if (Array.isArray(value)) {
		// A plain cold-path copy avoids invoking an authored slice/species and
		// reads indexed accessors only once before preparing the accepted keys.
		const copy: any[] = [];
		const length = value.length;
		for (let index = 0; index < length; index++) {
			copy[index] = adoptedDeoptChildren(value[index], cursor);
		}
		if (POSITIONAL_CHILDREN.has(value)) POSITIONAL_CHILDREN.add(copy);
		return copy;
	}
	if (value == null || value === false || value === true || value === '') return value;
	const type = typeof value;
	const element = isElementDescriptor(value);
	if (!element && type !== 'string' && type !== 'number' && type !== 'bigint') return value;
	const node = cursor.node;
	if (node === null) return value;
	cursor.node = getNextSibling(node);
	return element ? (getDeoptDesc(node) ?? value) : value;
}

// Build the adoption queue for an upgraded element: pair each existing raw
// child node (from `first`, in DOM order) with the key
// its OLD child value carries under the same keying scheme the incoming items
// will use. Empty old values (null/false/'' — the raw path rendered nothing
// for them) occupy a key slot but get no node. Stops pairing at the first
// node/value mismatch (defensive; unpaired nodes are swept after the render).
function buildDeoptAdoptQueue(
	oldChildren: any,
	first: Node | null,
): Array<{ key: any; node: Node }> {
	// SAME flatten + keying as the childSlot array path (incl. compound
	// slot-scoped keys for nested arrays) — the queue's keys must match the
	// keys the incoming items will get, or nothing adopts.
	const accepted = adoptedDeoptChildren(oldChildren, { node: first });
	const prepared = prepareDeoptList(accepted, true)!;
	const { items, keys } = prepared;
	const queue: Array<{ key: any; node: Node }> = [];
	let cursor: Node | null = first;
	for (let i = 0; i < items.length; i++) {
		const v = items[i];
		if (v == null || v === false || v === true || v === '') continue; // rendered nothing
		if (cursor === null) break;
		const t = typeof v;
		const isText = t === 'string' || t === 'number' || t === 'bigint';
		const compatible = isText
			? cursor.nodeType === 3
			: isHostDescriptor(v)
				? cursor.nodeType === 1 && isHostElementOfType(cursor as Element, v.type)
				: false;
		if (!compatible) break;
		queue.push({ key: keys[i], node: cursor });
		cursor = getNextSibling(cursor);
	}
	return queue;
}

/**
 * A staged upgrade's list at its commit, over the host's adopted children: the
 * pairs of adopted rows wrap their nodes, then the list's end, its rows from
 * the last (each moved only when out of place) and its start. Its new rows
 * have landed at the host's end (queueFrontier) and move into place here. The
 * upgraded host's children slot (its slot 0) must still show this list.
 */
function placeUpgradedList(args: any[]): void {
	const [state, owner, host, wraps] = args as [ForSlot, Block, Node, any[] | null];
	if (owner.disposed || (owner.slots[0] as ChildSlot | undefined)?.forSlot !== state) return;
	if (wraps !== null)
		for (let i = 0; i < wraps.length; i += 2) {
			const node: Node = wraps[i + 1];
			if (node.parentNode !== host) continue;
			host.insertBefore(wraps[i].startMarker, node);
			host.insertBefore(wraps[i].endMarker, getNextSibling(node));
		}
	host.insertBefore(state.end, null);
	let anchor: Node = state.end;
	for (let block = state.tail; block !== null; block = block.prevSibling) {
		if (getNextSibling(block.endMarker!) !== anchor) moveBlockBefore(block, anchor);
		anchor = block.startMarker!;
	}
	host.insertBefore(state.start, anchor);
}

// List-only reconciliation is separate from childSlot's text/function path so
// its first-use compilation can remain deferred until a list value reaches it.
// Slot registration and upgrade ownership have already been established.
export function journalRootChildShape(state: ChildSlot): void {
	if (ROOT_RENDER_TRANSACTION === null || ROOT_RENDER_TRANSACTION.aborted || ROOT_RENDER_ROLLBACK)
		return;
	// Compiled holes cache their input after this helper returns. A structural
	// clear can be the parent's only binding write, so restore that cache too.
	journalBag();
	journalObjectOnce(state);
}

export function renderPreparedChildList(
	state: ChildSlot,
	parentBlock: Block,
	domParent: Node,
	preparedList: { items: any[]; keys: any[] | null },
	hydration: HydrationCapability | null,
	upgradeArmed: boolean,
	upgradeChildren: any,
	compiledMapBody?: (item: any, scope: Scope) => void,
	compiledMapKey?: (item: any, index: number) => any,
	compiledMapFlags?: number,
	compiledMapDeps?: any[],
	mappedFallback?: boolean,
): void {
	const passthroughList = hydrating
		? hydration?.passthroughRanges === true && state.borrowed
		: false;
	let passthroughStart: Comment | null = null;
	let passthroughEnd: Comment | null = null;
	if (preparedList.items.length === 0 && hydration === null && state.ownerHost !== null) {
		// An owns-parent slot needs no list anchors while empty. This also lets
		// an upgraded host retain its element after its last component disappears,
		// without leaving an otherwise empty element framed by list comments.
		if (state.forSlot !== null && ROOT_RENDER_TRANSACTION === null) teardownChildForSlot(state);
		clearChildContent(state);
		return;
	}
	if (state.forSlot === null) {
		// Drop any prior block/text content — EXCEPT while hydrating, where the
		// server emitted one `<!--[-->…<!--]-->` range per item between our adopted
		// markers and `reconcileKeyed`/`mountItem` ADOPT those ranges off the
		// cursor. Sweeping here would delete the very item DOM (and break the
		// hydrateNode chain) the de-opt list is about to adopt. The pure-host →
		// blocks upgrade adopts the SAME way (the element's raw children ARE the
		// incoming items), so it must not sweep either.
		if (hydration === null && !upgradeArmed) clearChildContent(state);
		// A text-mode sole-child write wiped the host wholesale and took the
		// minted markers with it. Anchoring the new list on those detached
		// comments would insert into a null parent — drop them and re-mint.
		if (state.end !== null && state.end.parentNode === null) {
			state.end = null;
			state.start = null;
		}
		if (state.end === null) {
			// OWNS-PARENT slot entering array mode: ForSlot requires a real
			// marker pair (reconcileKeyed anchors on it) — mint it lazily,
			// appended at the element's tail. One-way, like the promotion above.
			state.end = document.createComment('');
			let anchor: Node | null = null;
			if (passthroughList) {
				for (let owner: Block | null = parentBlock; owner !== null; owner = owner.parentBlock) {
					if (
						owner.forSlot !== null &&
						owner.endMarker !== null &&
						markerParent(owner.endMarker) === domParent
					) {
						anchor = owner.endMarker;
						break;
					}
				}
				if (anchor === null) {
					let node = domParent.lastChild;
					while (node !== null && isRendererHydrationStyle(node)) {
						anchor = node;
						node = node.previousSibling;
					}
				}
			}
			// The raw children of a host that upgrades to Blocks stay where they are
			// while its render adopts them: its list's markers, the moves of what it
			// adopts and its new rows land at commit (placeUpgradedList). A hydrating
			// render places the list's markers in the server DOM at commit, also where
			// it builds the list with adoption suspended; a committed host's new list
			// builds off-document, and its commit appends it.
			if (upgradeArmed) {
				// placeUpgradedList puts it at the host's end.
			} else if (hydration !== null || (hydrating && domParent.isConnected))
				placeAtCommit(domParent, state.end, anchor);
			else if (!passthroughList && usesFrontier(parentBlock, domParent))
				slotFrontier(state, parentBlock, domParent, null).appendChild(state.end);
			else domParent.insertBefore(state.end, anchor);
			if (passthroughList) passthroughEnd = state.end;
		}
		if (state.start === null) {
			state.start = document.createComment('');
			const cursor = passthroughList ? hydration!.node : null;
			const before = cursor !== null && cursor.parentNode === domParent ? cursor : state.end;
			if (upgradeArmed) {
				// placeUpgradedList puts it before the host's first row.
			} else if (hydration !== null || (hydrating && domParent.isConnected))
				placeAtCommit(domParent, state.start, before);
			else {
				// A committed slot's end stays put; the list's start lands with its
				// rows at commit, before that end.
				const parent = state.end.parentNode!;
				if (usesFrontier(parentBlock, parent))
					slotFrontier(state, parentBlock, parent, state.end).appendChild(state.start);
				else parent.insertBefore(state.start, before);
			}
			if (passthroughList) passthroughStart = state.start;
		}
		state.forSlot = {
			__kind: 'forBlockSlot',
			start: state.start,
			// Non-null: an anchorless slot was promoted to markers above.
			end: state.end!,
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
			plainDeopt: null,
			mappedNative: undefined,
			selectionItems: undefined,
			signalSite: undefined,
			next: null,
		};
		if (upgradeArmed)
			state.forSlot.adopt = buildDeoptAdoptQueue(upgradeChildren, getFirstChild(domParent));
	}
	const { items, keys } = preparedList;
	const keySource = compiledMapKey || keys!;
	const normalizeKey = !!compiledMapKey;
	const wasMappedNative = state.forSlot.mappedNative === true;
	const body =
		compiledMapBody || (mappedFallback === true ? mappedDeoptItemBody : (deoptItemBody as any));
	if (compiledMapBody === undefined && wasMappedNative && state.forSlot.size > 0) {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			if (!isHostDescriptor(item)) continue;
			const block = state.forSlot.items.get(readListKey(keySource, item, index, normalizeKey));
			if (
				block !== undefined &&
				block.startMarker !== null &&
				block.startMarker === block.endMarker &&
				block.startMarker.nodeType === 1 &&
				(block.startMarker as Element).localName === item.type
			) {
				const root = block.startMarker as Element;
				const text = getFirstChild(root);
				if (text?.nodeType === 3 && getNextSibling(text) === null) {
					const children = Object.getOwnPropertyDescriptor(item, 'children');
					const primitive =
						children !== undefined &&
						'value' in children &&
						(typeof children.value === 'string' ||
							typeof children.value === 'number' ||
							typeof children.value === 'bigint');
					if (primitive) {
						(text as any).$$deoptKey = 0;
					} else if (children?.get !== undefined) {
						// Scoped JSX descriptors defer children until their represented
						// render scope. Prove this node came from the compiled binding bag
						// without invoking that scope-sensitive accessor in the parent.
						const bag = block.slots[0];
						if (bag !== null && bag !== undefined) {
							for (const field in bag) {
								if (bag[field] === text) {
									(text as any).$$deoptKey = 0;
									break;
								}
							}
						}
					}
				}
				block.deoptNode = block.startMarker;
			}
		}
	}
	if (compiledMapBody !== undefined) state.forSlot.mappedNative = true;
	// `body` is `deoptItemBody` exactly when the compiler supplied no map body
	// and this is not the mapped fallback. Record it on the slot rather than
	// re-deriving it by identity in mountItem (see ForSlot.plainDeopt).
	const plainDeopt = compiledMapBody === undefined && mappedFallback !== true;
	state.forSlot.plainDeopt = plainDeopt ? updateDeoptComponent : null;
	const fastFlags = compiledMapFlags || 0;
	const ssrMarkerless = compiledMapBody !== undefined && (fastFlags & 16) !== 0;
	let pure = (fastFlags & 1) !== 0;
	let lite = false;
	if (compiledMapBody !== undefined) {
		state.forSlot.env = compiledMapDeps;
		if ((fastFlags & 4) !== 0 && compiledMapDeps !== undefined) {
			if (
				state.forSlot.cachedDeps !== null &&
				depsEqual(state.forSlot.cachedDeps, compiledMapDeps)
			) {
				pure = true;
			} else {
				lite = true;
			}
			state.forSlot.cachedDeps = compiledMapDeps;
		}
	}
	// singleRoot=2 (marker-elision M4): pure single-element items self-mark —
	// no `it` pair per item — resolved per item value in mountItem; shape
	// flips promote to a minted pair in place (deoptItemBody).
	// First fill dispatches to the linear pass directly (see mountItemsLinear)
	// so a de-opt list's hydration adopt skips the full reconciler too.
	let adoptByKey: Map<any, number> | null = null;
	const forSlot = state.forSlot;
	if (forSlot.size === 0) {
		const adopt = forSlot.adopt;
		try {
			if (adopt !== null && items.length !== 0) {
				adoptByKey = new Map();
				for (let i = 0; i < adopt.length; i++) {
					const key = adopt[i].key;
					if (!adoptByKey.has(key)) adoptByKey.set(key, i);
				}
			}
			const wraps = mountItemsLinear(
				parentBlock,
				forSlot,
				items,
				keySource,
				body,
				compiledMapBody === undefined ? 2 : (fastFlags & 2) !== 0,
				ssrMarkerless,
				normalizeKey,
				passthroughList,
				// An upgrade's list has no placed markers until its commit.
				adopt !== null ? domParent : null,
				adoptByKey,
			);
			if (adoptByKey !== null)
				ROOT_RENDER_TRANSACTION!.ops.push(placeUpgradedList, [
					forSlot,
					parentBlock,
					domParent,
					wraps,
				]);
		} catch (error) {
			if (passthroughStart !== null) {
				discardMarker(passthroughStart);
				state.start = null;
			}
			if (passthroughEnd !== null) {
				discardMarker(passthroughEnd);
				state.end = null;
			}
			if (passthroughStart !== null || passthroughEnd !== null) state.forSlot = null;
			throw error;
		}
		// Only first-fill adoption consumes unowned server items, as in forBlock.
		if (hydration !== null && !passthroughList) hydration.settle(state.forSlot.end, parentBlock);
	} else {
		reconcileKeyed(
			parentBlock,
			state.forSlot,
			items,
			keySource,
			body,
			pure,
			compiledMapBody === undefined ? 2 : (fastFlags & 2) !== 0,
			lite,
			(fastFlags & 8) !== 0,
			ssrMarkerless,
			normalizeKey,
		);
		if (pure && SKIPPED_ROW_REFRESH) SKIPPED_ROW_REFRESH(state.forSlot, parentBlock);
	}
	// Upgrade adoption: nodes the empty→fill mount didn't consume (old
	// children whose keys have no new item) are orphans inside the range —
	// sweep them now.
	if (state.forSlot.adopt !== null) {
		const leftovers = state.forSlot.adopt;
		const consumed = state.forSlot === forSlot ? adoptByKey : null;
		for (let i = 0; i < leftovers.length; i++) {
			if (consumed?.get(leftovers[i].key) === -i - 1) continue;
			const n = leftovers[i].node;
			if (n.parentNode !== null) {
				if (ROOT_RENDER_TRANSACTION !== null) {
					queueRootDeletion(() => detachDeoptTreeRefs(n, null), n, n);
				} else {
					detachDeoptTreeRefs(n, null);
					n.parentNode!.removeChild(n);
				}
			}
		}
		state.forSlot.adopt = null;
	}
	if (passthroughList && !hydration!.passthroughRanges) {
		// Once this list consumed the selected owner, its containing item must
		// end after the entire list, including its own closing marker.
		hydration!.node = getNextSibling(state.forSlot.end);
	}
	return;
}
