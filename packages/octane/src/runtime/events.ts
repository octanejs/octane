// Events
//
// Native delegated events: handler slots and bundles, event-name parsing,
// delegation targets, portal-aware dispatch paths and propagation.

import {
	FORM_SUBMIT_DRIVER,
	clearCurrentTarget,
	type SubmitDispatchRec,
	snapshotSubmitDispatch,
} from './actions.js';
import { beginBindingEvent, consumeBindingEvent } from '../dom-binding-handoff.js';
import {
	isDelegatedEventProp,
	delegatedEventFlags,
	EVENT_BUBBLE,
	EVENT_NATIVE_CAPTURE,
	EVENT_CAPTURE,
	EVENT_DISABLED_MOUSE,
	EVENT_DISABLED_ENTER,
	EVENT_DISCRETE,
	EVENT_RESTORE,
	EVENT_TARGET_ONLY,
	EVENT_CUSTOM_NATIVE_ONLY,
} from '../event-names.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { beginNativeEventBatch } from '../signals/native-read-events.js';
import {
	signalOwnerUse,
	activeSynchronousSignalOwner,
	activeSignalOwnerEnvironment,
} from '../signals/owner-context.js';
import { signalDocumentEnabled } from '../signals/document-owner.js';
import type { SignalOwner } from '../signals/types.js';
import type { RootRenderTransaction } from './types.js';
import {
	CONTROLLED_RESTORE_DRIVER,
	publishManualFormPending,
	SIGNAL_BINDINGS_ENABLED,
	noop,
} from './drivers.js';
import {
	inFlush,
	journalRootProperty,
	retiringHostsSince,
	retireEventHostTree,
	portalEventTargetCount,
	eventRootEpoch,
	changeEventRootMembership,
} from './engine.js';
import { preparePortalEventOwners, type PortalSlot } from './portals.js';
import type { BlockImpl, ScopeImpl } from './block.js';
import {
	CURRENT_SCOPE,
	TRANSITION_JOURNAL,
	TRANSITION_JOURNAL_DEPTH,
	ROOT_RENDER_TRANSACTION,
	ROOT_DISCARD_STAMP,
	fireEventSlot,
	closeNativeEventBatch,
} from './render.js';
import { SIGNAL_EVENT_OWNERS_RECORDED, setEventHandler } from './hydration-presentation.js';
import { isHtmlCustomElement } from './host-props.js';
import { JOURNAL_PROP, journalObjectOnce } from './commit.js';
import { getNextSibling, seedExpando, initDomOperations } from './templates.js';
import { pendingRestores } from './forms.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

export function isEventKey(k: string): boolean {
	const c = k.charCodeAt(2);
	return (
		k.length > 2 &&
		k.charCodeAt(0) === 111 /*o*/ &&
		k.charCodeAt(1) === 110 /*n*/ &&
		c >= 65 /*A*/ &&
		c <= 90 /*Z*/
	);
}

// DOM-stamp prefixes for delegated handlers. Bubble handlers stamp `$o<type>`;
// capture handlers (`onXxxCapture`) stamp `$ocapture:<type>` so the two phases
// stay independent on the same element + event type. The namespace must belong to
// Octane alone: Solid's delegation reads and calls `node.$$<type>` from a document
// listener, so sharing `$$` ran each library's handlers twice inside an Octane
// root (#1882). The compiler emits the same keys (compile.js, event attributes).
// Bubble keys inline the `'$o'` literal: a named constant for it measured larger
// in every production bundle.
const CAPTURE_PREFIX = '$ocapture:';

// Parse an `on<Name>` / `on<Name>Capture` handler prop into its delegated event
// `type`, DOM-stamp `key`, and phase. React-shape: a trailing `Capture` selects the
// capture phase (fired root→target before bubble handlers). The real events
// `gotpointercapture` / `lostpointercapture` literally end in "capture", so they're
// excluded from the suffix rule (`onGotPointerCapture` is the bubble handler for
// `gotpointercapture`; `onGotPointerCaptureCapture` is its capture handler).
function jsxEventName(rest: string): string {
	// JSX-compatible `onDoubleClick` maps to the native DOM `dblclick` event.
	// Keep this centralized so direct compiler bindings and spread/de-opt bindings stamp
	// the same slot key and register the same delegated event.
	if (rest === 'DoubleClick') return 'dblclick';
	if (rest === 'Focus') return 'focusin';
	if (rest === 'Blur') return 'focusout';
	return rest.toLowerCase();
}

interface ParsedEventSlot {
	readonly type: string;
	readonly key: string;
	readonly capture: boolean;
}

// Only the finite delegated JSX catalog is retained. Unknown native event names
// keep the uncached fallback, and custom-element acceptance stays element-local.
let PARSED_EVENT_SLOTS: Map<string, ParsedEventSlot> | undefined;

export function eventSlot(name: string, el?: Element): ParsedEventSlot | null {
	if (
		!isEventKey(name) ||
		(el !== undefined && isHtmlCustomElement(el) && !isDelegatedEventProp(name))
	)
		return null;
	const cached = PARSED_EVENT_SLOTS?.get(name);
	if (cached !== undefined) return cached;
	let rest = name.slice(2);
	let capture = false;
	if (
		rest.length > 7 &&
		rest.endsWith('Capture') &&
		name !== 'onGotPointerCapture' &&
		name !== 'onLostPointerCapture'
	) {
		capture = true;
		rest = rest.slice(0, rest.length - 7);
	}
	const type = jsxEventName(rest);
	const slot = { type, key: capture ? CAPTURE_PREFIX + type : '$o' + type, capture };
	if (isDelegatedEventProp(name)) (PARSED_EVENT_SLOTS ??= new Map()).set(name, slot);
	return slot;
}

// ---------------------------------------------------------------------------
// Events — top-level delegation. Handlers are bare functions or nominal bundles.
// ---------------------------------------------------------------------------

const EVENT_SLOT_KIND = /* @__PURE__ */ Symbol();
const HANDLER_BUNDLE_KIND = 1;
const INVALID_EVENT_LISTENER_KIND = 2;
export interface HandlerBundle {
	[EVENT_SLOT_KIND]: typeof HANDLER_BUNDLE_KIND;
	fn: (...args: any[]) => any;
	// An array for arity 0/N; fixed arities carry their arguments in the bundle.
	// Negative tags prepend the native event to lifted block-arrow captures.
	args: any[] | 1 | 2 | -1 | -2;
	a0?: any;
	a1?: any;
	// Live compiled bundles retain their host; queued dispatch snapshots do not update.
	el?: Element;
}

interface InvalidEventListenerSlot {
	[EVENT_SLOT_KIND]: typeof INVALID_EVENT_LISTENER_KIND;
	name: string;
	value: unknown;
}

export type EventSlot = unknown;

function isHandlerBundle(slot: EventSlot): slot is HandlerBundle {
	return (
		typeof slot === 'object' &&
		slot !== null &&
		(slot as HandlerBundle)[EVENT_SLOT_KIND] === HANDLER_BUNDLE_KIND
	);
}

/**
 * Development compiler/runtime boundary for a dynamic `onXxx` prop. React
 * validates the prop while applying it, then independently fails again when
 * dispatch tries to read/invoke the invalid listener. Keep the invalid value in
 * a DEV-only descriptor so falsy values such as `false` still reach dispatch and
 * the eventual error can retain the authored prop spelling.
 *
 * Production-compiled direct bindings never import or call this helper. Runtime
 * fallback paths guard their calls with NODE_ENV, so optimized bundles remove
 * the warning strings, descriptor allocation, and branch in full.
 */
export function devEventListener(name: string, listener: unknown): unknown {
	if (process.env.NODE_ENV === 'production') return listener;
	if (listener == null || typeof listener === 'function') return listener;
	if (listener === false) {
		console.error(
			`Expected \`${name}\` listener to be a function, instead got \`false\`.\n\n` +
				`If you used to conditionally omit it with ${name}={condition && value}, ` +
				`pass ${name}={condition ? value : undefined} instead.`,
		);
	} else {
		console.error(
			`Expected \`${name}\` listener to be a function, instead got a value of ` +
				`\`${typeof listener}\` type.`,
		);
	}
	return { [EVENT_SLOT_KIND]: INVALID_EVENT_LISTENER_KIND, name, value: listener };
}

function isInvalidEventListenerSlot(slot: unknown): slot is InvalidEventListenerSlot {
	return (
		process.env.NODE_ENV !== 'production' &&
		typeof slot === 'object' &&
		slot !== null &&
		(slot as InvalidEventListenerSlot)[EVENT_SLOT_KIND] === INVALID_EVENT_LISTENER_KIND
	);
}

/** True only for a slot the delegated dispatcher can actually invoke. */
export function isUsableEventSlot(slot: EventSlot): boolean {
	return typeof slot === 'function' || isHandlerBundle(slot);
}

// ---------------------------------------------------------------------------
// Event bundle helpers (compiled-output plan 3b) — compiler targets for the
// `() => fn(arg, …)` bundle optimization. Mount (`evtN`): build the
// nominal handler descriptor ONCE, assign it to the element's event slot, and
// return it for the binding bag (one field instead of el + fn + each arg).
// Update (`evtNu`): mutate the SAME descriptor in place between events. A
// synchronous update during dispatch preserves only the queued snapshot before
// mutating, so later events see the change without rebuilding every render.
// Arity variants mirror fireEventSlot's dispatch switch; `evtN`/`evtNu` are
// the rest fallbacks. Arity-0 descriptors share one empty args array; arity-1/2
// store their arguments in fields instead of allocating a second array. Their
// `args` numeric tag keeps the common dispatch read in the same property slot.
// Keep the computed brand last in every bundle literal, including dispatch
// snapshots, so V8 can initialize fn/args from its object-literal boilerplate.
// A live scope token already captures unchanged authority. Explicit/environment
// and document owners still refresh it.
// ---------------------------------------------------------------------------

// Data equality skips dispatch/journal snapshots, never authority publication:
// a stable callback can move to another owner without changing its captures.
// Compare fields first and keep array-reference semantics for arity N.
export const EMPTY_ARGS: any[] = [];

/** Commit a native handler slot; its authority was published at render. */
export function setEventSlot(el: Element, key: string, handler: unknown): void {
	const host = el as any;
	if (TRANSITION_JOURNAL !== null) TRANSITION_JOURNAL.push(JOURNAL_PROP, el, key, host[key]);
	host[key] = handler;
}

/**
 * Commit a compiled handler bundle from its pending cells: the callback at
 * `cell`, then its captures (a0/a1) or, for arity N, the argument array.
 * Dispatch reads the bundle, so it only ever sees committed values. A commit
 * function writes the fields itself unless it is careful (bagDone).
 */
export function commitEventBundle(bag: any, d: HandlerBundle, next: any[], cell: number): void {
	const args = d.args;
	const count = typeof args === 'number' ? (args < 0 ? -args : args) : args === EMPTY_ARGS ? 0 : 1;
	const fn = next[cell];
	const a0 = count === 0 ? bag : next[cell + 1];
	const a1 = count === 2 ? next[cell + 2] : bag;
	if (fn === bag && a0 === bag && a1 === bag) return;
	if (_dispatchDepth !== 0) preserveDispatchedBundle(d);
	if (TRANSITION_JOURNAL !== null) journalObjectOnce(d);
	if (fn !== bag) d.fn = fn;
	if (a0 !== bag) {
		if (typeof args === 'number') d.a0 = a0;
		else d.args = a0;
	}
	if (a1 !== bag) d.a1 = a1;
}
export type SignalEventOwner = SignalOwner | ScopeImpl | BlockImpl;

/** Retire `node` and its following siblings through `last` (all of them when null). */
export function retireHostRange(node: Node | null, last: Node | null): void {
	for (; node !== null; node = getNextSibling(node)) {
		retireEventHostTree(node);
		if (node === last) return;
	}
}

/**
 * A root render's authority refresh for a committed handler publishes with
 * its commit, so dispatch before then keeps the committed authority. A later
 * pass of the same render compares against, and supersedes, the pending one.
 */
export function queueEventOwner(
	el: Element,
	owner: SignalEventOwner,
	transaction: RootRenderTransaction,
): void {
	const pending = (el as any).$$ownerNext as any[] | undefined;
	const shown =
		pending !== undefined && pending[2] === transaction ? pending[1] : (el as any).$$signalOwner;
	if (shown === owner) return;
	const next = [el, owner, transaction];
	journalRootProperty(el, '$$ownerNext', pending);
	(el as any).$$ownerNext = next;
	transaction.ops.push(publishEventOwner, next);
}

function publishEventOwner(next: any[]): void {
	const el = next[0];
	if (el.$$ownerNext !== next) return;
	el.$$ownerNext = undefined;
	el.$$signalOwner = next[1];
}

// A mount installs its bundle directly unless setEventHandler has more to do:
// journal the slot (see its ROOT_DISCARD_STAMP case) or publish authority
// (signalOwnerUse over-approximates its owner check).
export function evt0(el: Element, key: string, fn: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: EMPTY_ARGS, el, [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND };
	if (
		signalOwnerUse.active ||
		(TRANSITION_JOURNAL !== null &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP))
	)
		setEventHandler(el, key, d);
	else (el as any)[key] = d;
	return d;
}
export function evt0u(d: HandlerBundle, fn: any): void {
	if (d.fn !== fn) {
		if (_dispatchDepth !== 0) preserveDispatchedBundle(d);
		if (TRANSITION_JOURNAL !== null) journalObjectOnce(d);
		d.fn = fn;
	}
	if (
		(SIGNAL_BINDINGS_ENABLED ||
			signalDocumentEnabled ||
			activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			SIGNAL_EVENT_OWNERS_RECORDED) &&
		(activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			signalDocumentEnabled ||
			CURRENT_SCOPE?.block.idState.renderOwner?.signalOwner !== undefined ||
			(d.el as any).$$signalOwner !== CURRENT_SCOPE)
	)
		setEventHandler(d.el!);
}
export function evt1(el: Element, key: string, fn: any, a0: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: 1, a0, el, [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND };
	if (
		signalOwnerUse.active ||
		(TRANSITION_JOURNAL !== null &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP))
	)
		setEventHandler(el, key, d);
	else (el as any)[key] = d;
	return d;
}
export function evt1u(d: HandlerBundle, fn: any, a0: any): void {
	if (d.fn !== fn || !Object.is(d.a0, a0)) {
		if (_dispatchDepth !== 0) preserveDispatchedBundle(d);
		if (TRANSITION_JOURNAL !== null) journalObjectOnce(d);
		d.fn = fn;
		d.a0 = a0;
	}
	if (
		(SIGNAL_BINDINGS_ENABLED ||
			signalDocumentEnabled ||
			activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			SIGNAL_EVENT_OWNERS_RECORDED) &&
		(activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			signalDocumentEnabled ||
			CURRENT_SCOPE?.block.idState.renderOwner?.signalOwner !== undefined ||
			(d.el as any).$$signalOwner !== CURRENT_SCOPE)
	)
		setEventHandler(d.el!);
}
export function evt2(el: Element, key: string, fn: any, a0: any, a1: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: 2, a0, a1, el, [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND };
	if (
		signalOwnerUse.active ||
		(TRANSITION_JOURNAL !== null &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP))
	)
		setEventHandler(el, key, d);
	else (el as any)[key] = d;
	return d;
}
export function evt2u(d: HandlerBundle, fn: any, a0: any, a1: any): void {
	if (d.fn !== fn || !Object.is(d.a0, a0) || !Object.is(d.a1, a1)) {
		if (_dispatchDepth !== 0) preserveDispatchedBundle(d);
		if (TRANSITION_JOURNAL !== null) journalObjectOnce(d);
		d.fn = fn;
		d.a0 = a0;
		d.a1 = a1;
	}
	if (
		(SIGNAL_BINDINGS_ENABLED ||
			signalDocumentEnabled ||
			activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			SIGNAL_EVENT_OWNERS_RECORDED) &&
		(activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			signalDocumentEnabled ||
			CURRENT_SCOPE?.block.idState.renderOwner?.signalOwner !== undefined ||
			(d.el as any).$$signalOwner !== CURRENT_SCOPE)
	)
		setEventHandler(d.el!);
}
// Lifted block arrows receive the native event before their lexical captures.
// Negative arities preserve the ordinary bundle's exact authored argument list
// and reuse its field layout, update helpers, journal, and dispatch snapshot.
export function evt1e(el: Element, key: string, fn: any, a0: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: -1, a0, el, [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND };
	if (
		signalOwnerUse.active ||
		(TRANSITION_JOURNAL !== null &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP))
	)
		setEventHandler(el, key, d);
	else (el as any)[key] = d;
	return d;
}
export function evt2e(el: Element, key: string, fn: any, a0: any, a1: any): HandlerBundle {
	const d: HandlerBundle = { fn, args: -2, a0, a1, el, [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND };
	if (
		signalOwnerUse.active ||
		(TRANSITION_JOURNAL !== null &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP))
	)
		setEventHandler(el, key, d);
	else (el as any)[key] = d;
	return d;
}
export function evtN(el: Element, key: string, fn: any, args: any[]): HandlerBundle {
	const d: HandlerBundle = { fn, args, el, [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND };
	if (
		signalOwnerUse.active ||
		(TRANSITION_JOURNAL !== null &&
			(TRANSITION_JOURNAL_DEPTH !== 1 || CURRENT_SCOPE?.block.createdStamp !== ROOT_DISCARD_STAMP))
	)
		setEventHandler(el, key, d);
	else (el as any)[key] = d;
	return d;
}
export function evtNu(d: HandlerBundle, fn: any, args: any[]): void {
	if (d.fn !== fn || d.args !== args) {
		if (_dispatchDepth !== 0) preserveDispatchedBundle(d);
		if (TRANSITION_JOURNAL !== null) journalObjectOnce(d);
		d.fn = fn;
		d.args = args;
	}
	if (
		(SIGNAL_BINDINGS_ENABLED ||
			signalDocumentEnabled ||
			activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			SIGNAL_EVENT_OWNERS_RECORDED) &&
		(activeSynchronousSignalOwner !== null ||
			activeSignalOwnerEnvironment !== undefined ||
			signalDocumentEnabled ||
			CURRENT_SCOPE?.block.idState.renderOwner?.signalOwner !== undefined ||
			(d.el as any).$$signalOwner !== CURRENT_SCOPE)
	)
		setEventHandler(d.el!);
}

// Delegated event names registered by compiled modules' `delegateEvents([...])`
// calls. Listeners are NOT attached at module-eval time — they're attached to
// each root container when `createRoot` runs, and to each portal target when
// the portal mounts. This matches ReactDOM 17+ behaviour: events scoped to
// the React-owned subtrees, no document-level pollution.
export interface DelegatedEventType {
	name: string;
	bubbleKey: string;
	captureKey: string;
	flags: number;
}
export const _delegated = new Map<string, DelegatedEventType>();

// Active delegation targets (createRoot containers + portal targets). A
// portal target may host multiple portals; the refcount tracks how many
// portals are currently rendering into it so we detach only when the last
// one unmounts. createRoot containers have refcount 1 for their lifetime.
const _delegationTargets = new Map<Node, number>();
// Portal descendants can add their first host during a later local update,
// without rerendering the portal itself. Resolve those hosts from the portal's
// live owned range, paying this bookkeeping only for applications using portals.
export const _portalEventRanges = new WeakMap<Node, Set<PortalSlot>>();
const PORTAL_EVENT_PATH_LENGTH = /* @__PURE__ */ Symbol('octane.portalPathLength');
// Public roots end a logical event branch; portal targets do not. Keep this
// production ownership separate from the development-only duplicate-root guard.
interface EventRootMembership {
	count: number;
	since: number;
	previous: EventRootMembership | undefined;
}
export const _eventRoots = new WeakMap<Node, EventRootMembership>();
const EVENT_ROOT_EPOCH = /* @__PURE__ */ Symbol('octane.rootEpoch');

function isEventRoot(node: Node, epoch: number): boolean {
	let membership = _eventRoots.get(node);
	while (membership !== undefined && membership.since > epoch) membership = membership.previous;
	return membership !== undefined && membership.count > 0;
}

function prepareDelegatedEvent(event: Event, listener: Node): EventTarget[] | undefined {
	// Every delegated type has a root capture observer, even without an authored
	// capture handler. The outermost observer starts a fresh native delivery, so
	// synchronously redispatching the same Event never inherits an old root epoch.
	// One public root without portals needs only the epoch; its bubble listener
	// can build the path once, after native target listeners have run.
	if (_delegationTargets.size === 1 && portalEventTargetCount === 0) {
		beginBindingEvent(event);
		if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.begin(event, true);
		(event as any)[EVENT_ROOT_EPOCH] = eventRootEpoch;
		return;
	}
	const path = event.composedPath();
	if (_delegationTargets.size === 1) {
		beginBindingEvent(event);
		if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.begin(event, true);
		(event as any)[EVENT_ROOT_EPOCH] = eventRootEpoch;
		if (portalEventTargetCount !== 0) {
			preparePortalEventOwners(path, eventRootEpoch);
			(event as any)[PORTAL_EVENT_PATH_LENGTH] = path.length;
		}
		return path;
	}
	for (let i = path.length - 1; i >= 0; i--) {
		if (_delegationTargets.has(path[i] as Node)) {
			if (path[i] === listener) {
				beginBindingEvent(event);
				if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.begin(event, true);
				(event as any)[EVENT_ROOT_EPOCH] = eventRootEpoch;
				if (portalEventTargetCount !== 0) {
					preparePortalEventOwners(path, eventRootEpoch);
					(event as any)[PORTAL_EVENT_PATH_LENGTH] = path.length;
				}
			} else {
				// Inner capture may reveal a control behind a closed shadow root.
				// It observes this delivery, without starting another one.
				if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.begin(event, false);
				if (
					portalEventTargetCount !== 0 &&
					path.length > ((event as any)[PORTAL_EVENT_PATH_LENGTH] || 0)
				) {
					// Keep just a length on the Event, never a retained DOM path.
					preparePortalEventOwners(path, (event as any)[EVENT_ROOT_EPOCH] ?? eventRootEpoch);
					(event as any)[PORTAL_EVENT_PATH_LENGTH] = path.length;
				}
			}
			break;
		}
	}
	return path;
}

// Event names with authored capture-phase handlers (`onXxxCapture`). Ordinary
// bubbling types always have a capture observer to snapshot root membership;
// only these names also run a logical capture queue. Non-bubbling families share
// one native capture callback for their capture and emulated bubble queues.
export const _delegatedCapture = new Map<string, DelegatedEventType>();
// Capture registration installs this target before publishing its capture flag.
let CAPTURE_FINISH: typeof finishCaptureDispatch | null = null;

const ACTIVE_TOUCH_BUBBLE: AddEventListenerOptions = { passive: false };
const ACTIVE_TOUCH_CAPTURE: AddEventListenerOptions = { capture: true, passive: false };

function delegatedListenerOptions(
	name: string,
	capture: boolean,
): boolean | AddEventListenerOptions {
	return name === 'touchstart' || name === 'touchmove'
		? capture
			? ACTIVE_TOUCH_CAPTURE
			: ACTIVE_TOUCH_BUBBLE
		: capture;
}

// Public dynamic registration keeps classification at runtime; compiled static
// registrations supply the same immutable categories through the private ABI.
export function delegateEvents(eventNames: string[]): void {
	const canSeed = typeof Element !== 'undefined' && Object.isExtensible(Element.prototype);
	for (let i = 0; i < eventNames.length; i++) {
		const name = eventNames[i];
		if (_delegated.has(name)) continue;
		registerDelegatedBubble(
			_delegatedCapture.get(name) ?? createDelegatedEventType(name, delegatedEventFlags(name)),
			canSeed,
		);
	}
}

/** Compiler-only registration for already classified static event names. */
export function __delegateEvents(eventNames: string[], eventFlags: number[]): void {
	const canSeed = typeof Element !== 'undefined' && Object.isExtensible(Element.prototype);
	for (let i = 0; i < eventNames.length; i++) {
		const name = eventNames[i];
		if (_delegated.has(name)) continue;
		registerDelegatedBubble(
			_delegatedCapture.get(name) ?? createDelegatedEventType(name, eventFlags[i]),
			canSeed,
		);
	}
}

// Registries and listener attachment are infrastructure, not visual writes.
// Both installers publish them together even if the first render rolls back.
function registerDelegatedBubble(type: DelegatedEventType, canSeed: boolean): void {
	const name = type.name;
	type.flags |= EVENT_BUBBLE;
	_delegated.set(name, type);
	// Pre-seed the key polled on every logical ancestor, including unbound ones.
	if (canSeed) seedExpando(Element.prototype, '$o' + name);
	const capture = (type.flags & EVENT_NATIVE_CAPTURE) !== 0;
	for (const target of _delegationTargets.keys()) {
		if (capture && _delegatedCapture.has(name)) continue;
		target.addEventListener(name, dispatchDelegated, delegatedListenerOptions(name, capture));
		if (!capture) {
			target.addEventListener(name, dispatchDelegatedCapture, delegatedListenerOptions(name, true));
		}
	}
}

export function delegateCaptureEvents(eventNames: string[]): void {
	const canSeed = typeof Element !== 'undefined' && Object.isExtensible(Element.prototype);
	for (let i = 0; i < eventNames.length; i++) {
		const name = eventNames[i];
		if (_delegatedCapture.has(name)) continue;
		registerDelegatedCapture(
			_delegated.get(name) ?? createDelegatedEventType(name, delegatedEventFlags(name)),
			canSeed,
		);
	}
}

/** Compiler-only capture registration for already classified static names. */
export function __delegateCaptureEvents(eventNames: string[], eventFlags: number[]): void {
	const canSeed = typeof Element !== 'undefined' && Object.isExtensible(Element.prototype);
	for (let i = 0; i < eventNames.length; i++) {
		const name = eventNames[i];
		if (_delegatedCapture.has(name)) continue;
		registerDelegatedCapture(
			_delegated.get(name) ?? createDelegatedEventType(name, eventFlags[i]),
			canSeed,
		);
	}
}

function registerDelegatedCapture(type: DelegatedEventType, canSeed: boolean): void {
	const name = type.name;
	CAPTURE_FINISH = finishCaptureDispatch;
	type.flags |= EVENT_CAPTURE;
	_delegatedCapture.set(name, type);
	if (canSeed) seedExpando(Element.prototype, CAPTURE_PREFIX + name);
	for (const target of _delegationTargets.keys()) {
		if (_delegated.has(name)) continue;
		target.addEventListener(
			name,
			(type.flags & EVENT_NATIVE_CAPTURE) !== 0 ? dispatchDelegated : dispatchDelegatedCapture,
			delegatedListenerOptions(name, true),
		);
	}
}

/**
 * Register `target` (a createRoot container or a portal target DOM node) as
 * an event-delegation root. Idempotent w.r.t. each call: first registration
 * attaches all known delegated event listeners, subsequent registrations
 * just bump the refcount.
 */
export function registerDelegationTarget(target: Node, root = false): void {
	initDomOperations();
	if (root) changeEventRootMembership(target, 1);
	const prev = _delegationTargets.get(target) || 0;
	_delegationTargets.set(target, prev + 1);
	if (prev === 0) {
		// iOS Safari quirk (React parity): elements without a DIRECT click listener
		// don't dispatch taps up to a delegated ancestor listener. A noop `onclick`
		// on the delegation root (createRoot container / portal target) makes the
		// whole subtree tappable. Property assignment — never an attribute.
		if ((target as any).onclick == null && (target as any).nodeType === 1) {
			(target as any).onclick = noop;
		}
		for (const type of _delegated.values()) {
			const name = type.name;
			target.addEventListener(
				name,
				dispatchDelegated,
				delegatedListenerOptions(name, (type.flags & EVENT_NATIVE_CAPTURE) !== 0),
			);
			if ((type.flags & EVENT_NATIVE_CAPTURE) === 0) {
				target.addEventListener(
					name,
					dispatchDelegatedCapture,
					delegatedListenerOptions(name, true),
				);
			}
		}
		for (const type of _delegatedCapture.values()) {
			const name = type.name;
			if (_delegated.has(name)) continue;
			target.addEventListener(
				name,
				(type.flags & EVENT_NATIVE_CAPTURE) !== 0 ? dispatchDelegated : dispatchDelegatedCapture,
				delegatedListenerOptions(name, true),
			);
		}
	}
}

/**
 * Inverse of `registerDelegationTarget`. Last referent detaches all listeners.
 */
export function unregisterDelegationTarget(target: Node, root = false): void {
	if (root) changeEventRootMembership(target, -1);
	const prev = _delegationTargets.get(target);
	if (!prev) return;
	if (prev === 1) {
		_delegationTargets.delete(target);
		for (const type of _delegated.values()) {
			const name = type.name;
			target.removeEventListener(
				name,
				dispatchDelegated,
				(type.flags & EVENT_NATIVE_CAPTURE) !== 0,
			);
			if ((type.flags & EVENT_NATIVE_CAPTURE) === 0)
				target.removeEventListener(name, dispatchDelegatedCapture, true);
		}
		for (const type of _delegatedCapture.values()) {
			const name = type.name;
			target.removeEventListener(
				name,
				(type.flags & EVENT_NATIVE_CAPTURE) !== 0 ? dispatchDelegated : dispatchDelegatedCapture,
				true,
			);
		}
	} else {
		_delegationTargets.set(target, prev - 1);
	}
}

/**
 * Re-entrancy depth for dispatchDelegated. Only the outermost dispatch flushes
 * — nested handlers (e.g. a click handler that synthetically dispatches another
 * event on the same target chain) inherit the outer flush instead of producing
 * intermediate commits that React wouldn't.
 * It also scopes ordinary delegated updates outside an unrelated pending Action,
 * independently of whether this event type flushes synchronously.
 */
export let _dispatchDepth = 0;

// Both native phases share the same record, including late registrations.
function createDelegatedEventType(name: string, flags: number): DelegatedEventType {
	return { name, bubbleKey: '$o' + name, captureKey: CAPTURE_PREFIX + name, flags };
}

// A bubble version closes capture-only flush fallbacks without retaining a DOM
// path or a dispatch-completed flag on the Event. The same Event may be dispatched
// again synchronously; every native delivery must start a fresh logical walk.
const DELEGATED_BUBBLE_VERSION = /* @__PURE__ */ Symbol('octane.bubbleVersion');

// Keep framework propagation distinct from the browser's native stop flags.
// An earlier listener on this same root may already have set cancelBubble, and
// native stopImmediatePropagation must not abort an already-running logical queue.
// These temporary methods still operate on the original browser Event, and the
// exact prior own descriptors are restored before control returns to native code.
interface DelegatedEventFrame {
	event: Event | null;
	flags: number;
	stop: (() => void) | null;
	immediate: (() => void) | null;
	currentTarget: EventTarget | null;
}
// Private state belongs to the active logical phases, not to the native Event.
// Nested dispatch reuses another frame; clearing it releases every Event/DOM
// reference. Public method/accessor shadows still restore their exact lifetime.
const DELEGATED_EVENT_FRAMES: DelegatedEventFrame[] = [];
let delegatedEventFrameDepth = 0;

function delegatedFrameFor(event: Event): DelegatedEventFrame | undefined {
	for (let index = delegatedEventFrameDepth - 1; index >= 0; index--) {
		const frame = DELEGATED_EVENT_FRAMES[index];
		if (frame.event === event) return frame;
	}
}

function stopDelegatedPropagation(this: Event): void {
	const frame = delegatedFrameFor(this);
	if (frame !== undefined) frame.flags |= 1;
	const stop = frame?.stop || this.stopPropagation;
	// A consumer may retain the method and call it after native dispatch. The
	// temporary dispatch state is gone then, but the restored native method lives on.
	(stop === stopDelegatedPropagation ? Event.prototype.stopPropagation : stop).call(this);
}
function stopImmediateNativePropagation(this: Event): void {
	const frame = delegatedFrameFor(this);
	if (frame !== undefined) frame.flags |= 2;
	const stop = frame?.immediate || this.stopImmediatePropagation;
	(stop === stopImmediateNativePropagation ? Event.prototype.stopImmediatePropagation : stop).call(
		this,
	);
}
const STOP_PROPAGATION_DESCRIPTOR: PropertyDescriptor = {
	configurable: true,
	writable: true,
	value: stopDelegatedPropagation,
};
const STOP_IMMEDIATE_DESCRIPTOR: PropertyDescriptor = {
	configurable: true,
	writable: true,
	value: stopImmediateNativePropagation,
};

function installPropagationMethod(
	event: Event,
	name: 'stopPropagation' | 'stopImmediatePropagation',
	previous: PropertyDescriptor | undefined,
	descriptor: PropertyDescriptor,
): void {
	if (previous?.configurable === false) {
		// An immutable own method cannot be interposed while preserving the native
		// Event. Leave it native-only, like calling Event.prototype's method directly.
		if (previous.writable) Object.defineProperty(event, name, { value: descriptor.value });
	} else {
		Object.defineProperty(event, name, descriptor);
	}
}

function beginDelegatedPropagation(
	event: Event,
	stop: PropertyDescriptor | undefined,
	immediate: PropertyDescriptor | undefined | null,
): DelegatedEventFrame {
	let frame = DELEGATED_EVENT_FRAMES[delegatedEventFrameDepth];
	if (frame === undefined) {
		frame = { event: null, flags: 0, stop: null, immediate: null, currentTarget: null };
		DELEGATED_EVENT_FRAMES.push(frame);
	}
	delegatedEventFrameDepth++;
	frame.event = event;
	frame.flags = 0;
	frame.stop = event.stopPropagation;
	installPropagationMethod(event, 'stopPropagation', stop, STOP_PROPAGATION_DESCRIPTOR);
	// Only emulated bubbling needs to distinguish a native immediate stop before
	// starting another logical phase. Ordinary browser phases leave it untouched.
	if (immediate !== null) {
		frame.immediate = event.stopImmediatePropagation;
		installPropagationMethod(
			event,
			'stopImmediatePropagation',
			immediate,
			STOP_IMMEDIATE_DESCRIPTOR,
		);
	}
	return frame;
}

function endDelegatedPropagation(
	event: Event,
	stop: PropertyDescriptor | undefined,
	immediate: PropertyDescriptor | undefined | null,
): void {
	const frame = DELEGATED_EVENT_FRAMES[--delegatedEventFrameDepth];
	frame.event = null;
	frame.stop = null;
	frame.immediate = null;
	frame.currentTarget = null;
	if (stop === undefined) delete (event as any).stopPropagation;
	else Object.defineProperty(event, 'stopPropagation', stop);
	if (immediate !== null) {
		if (immediate === undefined) delete (event as any).stopImmediatePropagation;
		else Object.defineProperty(event, 'stopImmediatePropagation', immediate);
	}
}

// A receiver-specific target lets one accessor survive nested native dispatch.
const CURRENT_TARGET_DESCRIPTOR: PropertyDescriptor = {
	configurable: true,
	get(this: Event): EventTarget | null | undefined {
		return delegatedFrameFor(this)?.currentTarget;
	},
};
// Synchronous nested delegated walks borrow disjoint frames from this one stack.
const CAPTURE_PATH: any[] = [];
// Snapshot each native phase before user code runs. Re-entrant dispatch borrows a
// separate frame, and clearing the frame releases all node/handler references.
export const CAPTURE_SLOTS: EventSlot[] = [];
// Authority is a phase snapshot too: an earlier callback may publish a new
// handler/owner before a queued ancestor runs. Allocate only after ownership exists.
let CAPTURE_OWNERS: (SignalEventOwner | undefined)[] | null = null;

/** Snapshot the phase's handler slots; returns whether any node on the path has one. */
function snapshotDelegatedSlots(
	event: Event,
	base: number,
	type: DelegatedEventType,
	capture: boolean,
): boolean {
	const key = capture ? type.captureKey : type.bubbleKey;
	// Stamped by the root capture observer when this native delivery began.
	const epoch = (event as any)[EVENT_ROOT_EPOCH] as number;
	const suppressDisabled =
		(type.flags & EVENT_DISABLED_MOUSE) !== 0 ||
		(!capture && (type.flags & EVENT_DISABLED_ENTER) !== 0);
	// Only a removed subtree's root carries its stamp (retireEventHostTree), so the
	// outermost one retired before this delivery retires every path node below it:
	// React never calls an unmounted component's handlers. A host retiring during
	// the delivery keeps its handlers to its end, like a removed portal's route.
	let retiredTop = -1;
	if (retiringHostsSince !== 0)
		for (let index = CAPTURE_PATH.length - 1; index >= base; index--) {
			const stamp = CAPTURE_PATH[index].$$retiredEpoch;
			if (stamp >= retiringHostsSince && stamp <= epoch) {
				retiredTop = index;
				break;
			}
		}
	let found = false;
	for (let index = base; index < CAPTURE_PATH.length; index++) {
		const node = CAPTURE_PATH[index];
		const slot = node[key] as EventSlot;
		const active =
			slot != null &&
			(index <= retiredTop ||
				(suppressDisabled &&
					node.disabled &&
					(node.localName === 'button' ||
						node.localName === 'input' ||
						node.localName === 'select' ||
						node.localName === 'textarea')))
				? null
				: slot;
		CAPTURE_SLOTS[index] = active;
		if (active != null) {
			found = true;
			if (SIGNAL_EVENT_OWNERS_RECORDED) (CAPTURE_OWNERS ??= [])[index] = node.$$signalOwner;
		}
	}
	return found;
}

// Bundles are mutable between events to avoid per-render closures. Only a
// synchronous update inside a dispatch needs to preserve a queued old value;
// ordinary events and ordinary renders allocate no snapshot records.
function preserveDispatchedBundle(bundle: HandlerBundle): void {
	let snapshot: HandlerBundle | undefined;
	for (let index = 0; index < CAPTURE_SLOTS.length; index++) {
		if (CAPTURE_SLOTS[index] === bundle) {
			if (snapshot === undefined) {
				const args = bundle.args;
				snapshot =
					typeof args !== 'number'
						? { fn: bundle.fn, args: args.slice(), [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND }
						: args === 1 || args === -1
							? { fn: bundle.fn, args, a0: bundle.a0, [EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND }
							: {
									fn: bundle.fn,
									args,
									a0: bundle.a0,
									a1: bundle.a1,
									[EVENT_SLOT_KIND]: HANDLER_BUNDLE_KIND,
								};
			}
			CAPTURE_SLOTS[index] = snapshot;
		}
	}
}

type DelegatedNode = Node & {
	$$portalParent?: Node;
	$$portalContainer?: Node;
};

export type PortalEventBoundary = Node & {
	$$portalEventRange?: PortalSlot;
	$$portalEventStart?: PortalEventBoundary;
};

function resolvePortalEventOwner(node: DelegatedNode): void {
	if (node.$$portalParent != null || node.parentNode === null) return;
	// assignedSlot/composedPath can put a <slot> next, but a portal range belongs
	// to the direct child's actual DOM container, not the slot it projects into.
	const target = node.parentNode!;
	const ranges = _portalEventRanges.get(target);
	if (ranges === undefined) return;
	let owner: PortalSlot | undefined;
	let previous = node.previousSibling as PortalEventBoundary | null;
	let remainingSkips = ranges.size;
	while (previous !== null) {
		const closedStart = previous.$$portalEventStart;
		const closedRange = closedStart?.$$portalEventRange;
		if (
			remainingSkips !== 0 &&
			closedStart !== undefined &&
			closedRange !== undefined &&
			ranges.has(closedRange) &&
			closedRange.start === closedStart &&
			closedRange.end === previous &&
			closedStart.parentNode === target
		) {
			// Skip a completed foreign range, including all its content. A valid
			// backward walk skips each active range at most once. Bounding jumps
			// also prevents cycles if external DOM code reverses a marker pair;
			// after that bound, ordinary previousSibling steps always make progress.
			remainingSkips--;
			previous = closedStart.previousSibling as PortalEventBoundary | null;
			continue;
		}
		const range = previous.$$portalEventRange;
		const end = range?.end;
		if (
			range !== undefined &&
			ranges.has(range) &&
			range.start === previous &&
			end != null &&
			end.parentNode === target &&
			(previous.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
			(node.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
		) {
			// The first enclosing start encountered backwards is the innermost
			// active owner, including foreign ranges interleaved in a Fragment.
			owner = range;
			break;
		}
		previous = previous.previousSibling as PortalEventBoundary | null;
	}
	if (owner === undefined) return;
	if (ROOT_RENDER_TRANSACTION !== null) {
		journalRootProperty(node, '$$portalParent', (node as any).$$portalParent);
		journalRootProperty(node, '$$portalContainer', (node as any).$$portalContainer);
	}
	node.$$portalParent = owner.host;
	node.$$portalContainer = target;
}

export function prepareRegisteredPortalEventOwners(path: EventTarget[], epoch: number): void {
	for (let i = 0; i < path.length; i++) {
		const node = eventPathNode(path[i]);
		if (node === null) continue;
		resolvePortalEventOwner(node);
		// A nested portal's logical host need not occur on the native path.
		// Resolve that branch too, before native target listeners can move nodes.
		let logical = node.$$portalParent as DelegatedNode | undefined;
		while (logical != null && !isEventRoot(logical, epoch) && path.indexOf(logical) < 0) {
			resolvePortalEventOwner(logical);
			logical = (logical.$$portalParent || logical.parentNode) as DelegatedNode | undefined;
		}
	}
}

export function eventPathNode(target: EventTarget | null | undefined): DelegatedNode | null {
	return target != null && typeof (target as Node).nodeType === 'number'
		? (target as DelegatedNode)
		: null;
}

/**
 * Append the listener's logical target-to-root branch, excluding its owning
 * public root container. Returns the appended count; zero also means no route.
 *
 * Root containers themselves belong to the enclosing root when rebasing across
 * a foreign public root. Portal containers are routing boundaries, not ordinary
 * root boundaries: merely registering a portal target does not truncate children
 * that are not in a portal-owned range.
 */
function buildDelegatedPath(event: Event, listener: Node, path = event.composedPath()): number {
	const output = CAPTURE_PATH;
	const base = output.length;
	const epoch = (event as any)[EVENT_ROOT_EPOCH] ?? eventRootEpoch;
	// Portal teardown after capture cannot erase the current event's logical route.
	const mayHavePortal = portalEventTargetCount !== 0 || epoch !== eventRootEpoch;
	const listenerIndex = path.indexOf(listener);
	if (listenerIndex < 0) return 0;
	// The usual application has one unchanged public root and no portals. It
	// needs neither foreign-boundary rebasing nor per-ancestor ownership lookups.
	// A lifecycle change since capture disables this path for the current event.
	if (_delegationTargets.size === 1 && epoch === eventRootEpoch && isEventRoot(listener, epoch)) {
		let i = 0;
		for (; i < listenerIndex; i++) {
			const node = eventPathNode(path[i]);
			if (node === null || (mayHavePortal && node.$$portalParent != null)) break;
			output.push(node);
		}
		if (i === listenerIndex) return output.length - base;
		output.length = base;
	}
	let start = eventPathNode(path[0]);
	if (start === null) return 0;
	let startIndex = 0;
	let rebaseRootAtStart = false;

	for (;;) {
		output.length = base;
		let node: DelegatedNode | null = start;
		let index = startIndex;
		let firstBoundary: Node | null = null;
		let ownsBranch = false;
		let supersededByNearerPortal = false;

		while (node !== null) {
			// A fresh inner root owns the descendants, not the container's outer
			// handler. On rebasing, include that container in the next outer tree.
			if (isEventRoot(node, epoch) && !(node === start && rebaseRootAtStart)) {
				firstBoundary ??= node;
				if (node === listener) {
					if (firstBoundary === node) ownsBranch = true;
					else supersededByNearerPortal = true;
				}
				break;
			}

			output.push(node);
			const logicalParent = mayHavePortal ? node.$$portalParent : undefined;
			if (logicalParent != null) {
				// Use the actual portal container, NOT composedPath's next item:
				// a direct portal child can be slotted, making that next item a
				// <slot> rather than its real portal container. The cold stamp
				// also survives a handler moving the node during this dispatch.
				const container = node.$$portalContainer;
				if (container == null) {
					// Missing ownership is not permission to walk unrelated DOM.
					output.length = base;
					return 0;
				}
				firstBoundary ??= container;
				if (container === listener) {
					if (firstBoundary === container) ownsBranch = true;
					else supersededByNearerPortal = true;
				}
				// Keep walking after a matched portal: it owns the whole logical
				// branch up to the public root, not just its physical child range.
				node = logicalParent as DelegatedNode;
				index = path.indexOf(logicalParent);
			} else if (index >= 0) {
				node = eventPathNode(path[++index]);
			} else {
				// The logical portal host may not be on this native event's path.
				// Do not force a hidden shadow-root -> host crossing here.
				node = node.parentNode as DelegatedNode | null;
			}
		}

		if (supersededByNearerPortal) {
			output.length = base;
			return 0;
		}
		if (ownsBranch) return output.length - base;
		if (firstBoundary === null) {
			output.length = base;
			return 0;
		}

		// A foreign root/portal lies between the event target and this listener.
		// Switch to its host container in the enclosing tree. This is also how
		// a portal mounted inside another root reaches that other root's slots.
		const boundaryIndex = path.indexOf(firstBoundary);
		if (
			boundaryIndex < startIndex ||
			boundaryIndex >= listenerIndex ||
			(boundaryIndex === startIndex && rebaseRootAtStart)
		) {
			output.length = base;
			return 0;
		}
		start = firstBoundary as DelegatedNode;
		startIndex = boundaryIndex;
		rebaseRootAtStart = true;
	}
}

// Only a handler entering another signal owner needs a callback; the ordinary
// dispatch calls this directly.
export function invokeEventSlot(slot: EventSlot, event: Event): void {
	if (typeof slot === 'function') slot(event);
	else if (process.env.NODE_ENV !== 'production' && isInvalidEventListenerSlot(slot))
		invokeInvalidEventListener(`\`${slot.name}\``, slot.value, event);
	else if (isHandlerBundle(slot)) {
		const a = slot.args;
		if (typeof a !== 'number') {
			switch (a.length) {
				case 0:
					slot.fn();
					break;
				case 1:
					slot.fn(a[0]);
					break;
				case 2:
					slot.fn(a[0], a[1]);
					break;
				default:
					slot.fn.apply(null, a);
			}
		} else if (a === 1) {
			slot.fn(slot.a0);
		} else if (a === 2) {
			slot.fn(slot.a0, slot.a1);
		} else if (a === -1) {
			slot.fn(event, slot.a0);
		} else {
			slot.fn(event, slot.a0, slot.a1);
		}
	} else invokeInvalidEventListener(`${event.type} event`, slot, event);
}

function invokeInvalidEventListener(label: string, listener: unknown, event: Event): void {
	// React's getListener throws its actionable error for truthy invalid values.
	// Falsy-but-present listeners pass that check and fail at invocation instead;
	// preserve that observable distinction (notably the dedicated `false` render
	// guidance followed by a TypeError at dispatch).
	if (listener) {
		throw new Error(formatClientError(46, label, typeof listener));
	}
	const invoke = listener as (event: Event) => unknown;
	invoke(event);
}

// Surface a guarded listener exception the way the platform surfaces an uncaught
// one: through the global error event, then the console if nothing canceled it.
// `reportError` is exactly that; the fallback is the standard polyfill shape for
// environments without it (jsdom).
export function reportListenerError(err: unknown): void {
	if (typeof reportError === 'function') {
		reportError(err);
		return;
	}
	if (typeof window !== 'undefined' && typeof ErrorEvent === 'function') {
		const ev = new ErrorEvent('error', {
			error: err,
			message: String((err as any)?.message ?? err),
			cancelable: true,
		});
		window.dispatchEvent(ev);
		if (!ev.defaultPrevented) console.error(err);
		return;
	}
	console.error(err);
}

function finishCaptureDispatch(event: Event, type: DelegatedEventType): void {
	if (!event.bubbles || event.cancelBubble || (type.flags & EVENT_BUBBLE) === 0) {
		if (event.bubbles && (type.flags & EVENT_BUBBLE) !== 0 && CONTROLLED_RESTORE_DRIVER)
			CONTROLLED_RESTORE_DRIVER.enqueue(event, type);
		if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.finish(type);
		return;
	}
	if ((type.flags & EVENT_DISCRETE) === 0) return;
	// A missed bubble can leave a restore queued by a nested event in capture.
	// The target itself may also become controlled in a native listener below
	// this root, so retain the fallback for form controls even when $$ctrl is
	// not armed yet. Other events have no controlled work to finish here.
	if (pendingRestores.length === 0) {
		if ((type.flags & EVENT_RESTORE) === 0) return;
		const tag = (event.target as Element | null)?.localName;
		if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
	}
	const bubbleVersion = (event as any)[DELEGATED_BUBBLE_VERSION];
	const duringFlush = inFlush;
	const target = event.target;
	const delivery = CONTROLLED_RESTORE_DRIVER
		? CONTROLLED_RESTORE_DRIVER.delivery(event)
		: undefined;
	const fallback = () => {
		// A delivered bubble segment closes the capture segment's commit boundary
		// (controlled restores and their sync flush). When a native listener stops
		// the event below its root, close that window here instead.
		if ((event as any)[DELEGATED_BUBBLE_VERSION] === bubbleVersion) {
			if (
				CONTROLLED_RESTORE_DRIVER &&
				CONTROLLED_RESTORE_DRIVER.enqueue(event, type, duringFlush, target, delivery)
			) {
				CONTROLLED_RESTORE_DRIVER.finish(type);
			}
		}
	};
	// The browser performs a microtask checkpoint after EVERY listener callback
	// of an event it dispatches itself (the JS stack is empty between them), so
	// a microtask queued here — from the root's CAPTURE listener — would run
	// before the target's native listeners and before the root's bubble
	// listener. For a trusted edit that is fatal: the fallback would restore the
	// controlled value before onInput could hear the keystroke, snapping every
	// typed character back to the last rendered value as soon as any
	// onXxxCapture handler registers the type. Only a task runs after the whole
	// native propagation. A script-dispatched event keeps the dispatching script
	// on the stack, so its microtask cannot run until that script yields (after
	// the bubble segment) and remains the earliest correct fallback there: a
	// stopped controlled-select change restores in the same microtask batch as
	// its handlers' updates, before the dispatcher's next task.
	if (event.isTrusted) setTimeout(fallback, 0);
	else queueMicrotask(fallback);
}

function dispatchDelegated(this: Node, event: Event): void {
	const type = _delegated.get(event.type) ?? _delegatedCapture.get(event.type);
	if (type === undefined) return;
	const nativeCapture = (type.flags & EVENT_NATIVE_CAPTURE) !== 0;
	let path = nativeCapture ? prepareDelegatedEvent(event, this) : undefined;
	(event as any)[DELEGATED_BUBBLE_VERSION] = ((event as any)[DELEGATED_BUBBLE_VERSION] || 0) + 1;
	if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.enqueue(event, type);
	const targetOnly = (type.flags & EVENT_TARGET_ONLY) !== 0;
	_dispatchDepth++;
	const node = event.target as any;
	// A submit dispatch targeting a form opens the manual-action useFormStatus
	// window (see publishManualFormPending): handlers' startTransition calls
	// register on the record; the walk's end decides whether to publish.
	const prevSubmitRec = ACTIVE_SUBMIT_DISPATCH;
	const submitRec: SubmitDispatchRec | null =
		event.type === 'submit' && node != null && node.nodeName === 'FORM'
			? snapshotSubmitDispatch(node as HTMLFormElement, event as SubmitEvent)
			: null;
	if (submitRec !== null) ACTIVE_SUBMIT_DISPATCH = submitRec;
	const nativeBatch = beginNativeEventBatch(event);
	const pathBase = CAPTURE_PATH.length;
	let stop: PropertyDescriptor | undefined;
	let propagationStarted = false;
	let frame: DelegatedEventFrame;
	try {
		// Non-bubbling families share one native capture callback. Run the logical
		// capture queue first, independent of module registration order, and honor
		// a stop within that phase before starting the emulated bubble queue.
		if (nativeCapture && (type.flags & EVENT_CAPTURE) !== 0) {
			path ??= event.composedPath();
			if (dispatchDelegatedCapture.call(this, event, path, type)) return;
		}
		if ((type.flags & EVENT_BUBBLE) === 0) return;
		// Custom elements receive known nonbubbling events through authored
		// capture handlers only. They do not install the native target listener
		// that makes these built-in host events propagate in the bubble queue.
		if (
			node?.nodeType === 1 &&
			isHtmlCustomElement(node) &&
			(type.flags & EVENT_CUSTOM_NATIVE_ONLY) !== 0
		)
			return;
		buildDelegatedPath(event, this, path);
		// With no bubble handler on the logical path and no form action to drive,
		// nothing can observe the propagation frame: leave the native event's
		// stopPropagation/currentTarget untouched instead of patching and restoring
		// them for every unhandled pointer/touch/input event under the root.
		if (!snapshotDelegatedSlots(event, pathBase, type, false) && submitRec === null) return;
		stop = Object.getOwnPropertyDescriptor(event, 'stopPropagation');
		propagationStarted = true;
		frame = beginDelegatedPropagation(event, stop, null);
		for (let i = pathBase; i < CAPTURE_PATH.length; i++) {
			const current = CAPTURE_PATH[i];
			// Target-only native families never transfer a handler to a root boundary.
			if (targetOnly && current !== event.target) break;
			const slot = CAPTURE_SLOTS[i];
			if (slot != null && !consumeBindingEvent(event, current, false)) {
				setCurrentTarget(event, current, frame);
				fireEventSlot(slot, event, CAPTURE_OWNERS?.[i]);
				if ((frame.flags & 1) !== 0) break;
			}
			if (targetOnly) break;
		}
		// Form actions are a default action, after every user submit handler has
		// had a chance to cancel. Keep their storage separate from $osubmit.
		if (
			submitRec !== null &&
			FORM_SUBMIT_DRIVER &&
			!event.defaultPrevented &&
			CAPTURE_PATH.includes(submitRec.form, pathBase)
		) {
			FORM_SUBMIT_DRIVER(submitRec.form, event, submitRec.action, submitRec.submitter);
		}
	} finally {
		CAPTURE_PATH.length = pathBase;
		CAPTURE_SLOTS.length = pathBase;
		if (CAPTURE_OWNERS !== null) CAPTURE_OWNERS.length = pathBase;
		if (propagationStarted) endDelegatedPropagation(event, stop, null);
		if (submitRec !== null) {
			ACTIVE_SUBMIT_DISPATCH = prevSubmitRec;
			// Before the depth drop + discrete flush, so a published pending status
			// commits in this event's flush window (like handleFormSubmit's does).
			publishManualFormPending(submitRec);
		}
		// Only this bubble queue sets currentTarget here; the capture queue clears its own.
		if (propagationStarted) clearCurrentTarget(event);
		closeNativeEventBatch(event, nativeBatch, false);
		_dispatchDepth--;
		if (CONTROLLED_RESTORE_DRIVER) CONTROLLED_RESTORE_DRIVER.finish(type);
	}
}

// Capture runs only this native listener's segment, in reverse path order.
// Returning whether this queue stopped native propagation lets the shared
// non-bubbling listener decide whether it may start its emulated bubble queue.
function dispatchDelegatedCapture(
	this: Node,
	event: Event,
	path?: EventTarget[],
	type = _delegated.get(event.type) ?? _delegatedCapture.get(event.type),
): boolean {
	path ??= prepareDelegatedEvent(event, this);
	if (type === undefined || (type.flags & EVENT_CAPTURE) === 0) return false;
	// Root observation above is mandatory; this standalone guard lets bundles
	// without authored capture discard the logical phase below.
	if (!CAPTURE_FINISH) return false;
	path ??= event.composedPath();
	if ((!event.bubbles || (type.flags & EVENT_BUBBLE) === 0) && CONTROLLED_RESTORE_DRIVER)
		CONTROLLED_RESTORE_DRIVER.enqueue(event, type);
	const pathBase = CAPTURE_PATH.length;
	buildDelegatedPath(event, this, path);
	// Without a capture handler on the path no callback can observe the frame, so
	// the native stopPropagation/currentTarget stay untouched (see dispatchDelegated).
	const hasSlot = snapshotDelegatedSlots(event, pathBase, type, true);
	const stop = hasSlot ? Object.getOwnPropertyDescriptor(event, 'stopPropagation') : undefined;
	const immediate =
		hasSlot && (type.flags & EVENT_NATIVE_CAPTURE) !== 0
			? Object.getOwnPropertyDescriptor(event, 'stopImmediatePropagation')
			: null;
	const wasCancelled = event.cancelBubble;
	let stopped = false;
	_dispatchDepth++;
	const nativeBatch = beginNativeEventBatch(event);
	let frame: DelegatedEventFrame | undefined;
	try {
		if (hasSlot) {
			frame = beginDelegatedPropagation(event, stop, immediate);
			for (let i = CAPTURE_PATH.length - 1; i >= pathBase; i--) {
				const slot = CAPTURE_SLOTS[i];
				if (slot != null && !consumeBindingEvent(event, CAPTURE_PATH[i], true)) {
					setCurrentTarget(event, CAPTURE_PATH[i], frame);
					fireEventSlot(slot, event, CAPTURE_OWNERS?.[i]);
					if ((frame.flags & 1) !== 0) break;
				}
			}
		}
	} finally {
		// A frame that failed to begin still reports stopped, as before.
		stopped =
			(frame === undefined ? hasSlot : frame.flags !== 0) || (!wasCancelled && event.cancelBubble);
		CAPTURE_PATH.length = pathBase;
		CAPTURE_SLOTS.length = pathBase;
		if (CAPTURE_OWNERS !== null) CAPTURE_OWNERS.length = pathBase;
		if (hasSlot) {
			endDelegatedPropagation(event, stop, immediate);
			clearCurrentTarget(event);
		}
		closeNativeEventBatch(
			event,
			nativeBatch,
			event.bubbles && !event.cancelBubble && (type.flags & EVENT_BUBBLE) !== 0,
		);
		_dispatchDepth--;
		CAPTURE_FINISH(event, type);
	}
	return stopped;
}

// React parity for DELEGATED dispatch: handlers must see `event.currentTarget` as the
// element whose handler is firing (React's synthetic system guarantees this; ubiquitous
// in ported code — `event.target === event.currentTarget` guards, `currentTarget`-relative
// measurement/indexOf). Native `currentTarget` is the listener's attach node (our
// delegation ROOT), so shadow it with a configurable own property during each handler and
// remove the shadow after the walk (restoring native semantics).
function setCurrentTarget(
	event: Event,
	node: EventTarget | null,
	frame: DelegatedEventFrame,
): void {
	frame.currentTarget = node;
	Object.defineProperty(event, 'currentTarget', CURRENT_TARGET_DESCRIPTOR);
}

export let ACTIVE_SUBMIT_DISPATCH: SubmitDispatchRec | null = null;
