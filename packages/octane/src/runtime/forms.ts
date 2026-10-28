// Controlled forms
//
// Controlled `value`, `checked` and `selected`, their restoration after native
// events, defaults, autofocus and form diagnostics.

import {
	type EventSlot,
	isUsableEventSlot,
	type DelegatedEventType,
	_delegated,
	_delegatedCapture,
	_dispatchDepth,
} from './events.js';
import { hydrating, hydrationStarted } from '../hydration-flag.js';
import { EVENT_DISCRETE, EVENT_CAPTURE, EVENT_RESTORE } from '../event-names.js';
import { formAuthoringDiagnostics } from '../form-diagnostics.js';
import { nativeBatchHooks } from '../signals/read-protocol.js';
import { hasHydrationControlSignalWriter } from '../signals/early-values.js';
import type { Scope } from './types.js';
import {
	TRANSITION_TASK_DRIVER,
	HYDRATION_DRIVER,
	noop,
	queueControlledCommit,
	queueDevFormCheck,
	armControlledBase,
	TRANSITION_JOURNAL,
} from './drivers.js';
import {
	VIEW_TRANSITION_DRIVER,
	DEFERRED_LAYOUT_DRIVER,
	QUEUE,
	inFlush,
	ROOT_RENDER_TRANSACTIONS,
	flush,
	flushSync,
} from './engine.js';
import { hasPendingWork } from './effects.js';
import { CURSOR } from './hydration.js';
import { CURRENT_SCOPE, CURRENT_BLOCK, ROOT_RENDER_TRANSACTION } from './render.js';
import { DIRECT_SIGNAL_BINDING, type DirectSignalBinding } from './signal-bindings.js';
import { HTML_NS, isHtmlCustomElement } from './host-props.js';
import { componentSourceLoc } from './diagnostics.js';
import { JOURNAL_PROP, atCommit, journalBag, journalObjectOnce } from './commit.js';
import { radioGroupCandidates, toControlledString } from '../radio-group.js';
import { getFirstChild, getNextSibling } from './templates.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// Only the OUTERMOST discrete dispatch is a commit boundary: nested programmatic
// dispatches inherit the outer window. Like React's batchedUpdates, the boundary
// commits synchronously only when a controlled form control armed a state
// restore (input/change/click on a `value`/`checked` host); every other discrete
// update stays in the microtask batch scheduleRender already armed, so a
// script-dispatched event never publishes a commit mid-dispatch that React would
// publish after the dispatching script yields. Non-discrete events keep microtask
// batching too; they must not be staged with an unrelated async Action merely
// because they do not flush synchronously here.
export function maybeFlushDiscrete(type: DelegatedEventType): void {
	if (_dispatchDepth === 0 && (type.flags & EVENT_DISCRETE) !== 0 && pendingRestores.length > 0) {
		// Commit handler-scheduled work first, so the controlled restore below
		// compares the DOM against the values the handlers just rendered. Signal
		// writes from an event a graph subscriber dispatched still wait in the
		// graph's queue; admit their renders first.
		if (nativeBatchHooks) nativeBatchHooks.present();
		if (!inFlush && hasPendingWork()) {
			// Native events can fire from commit-phase DOM mutations or effects.
			// The ambient flush already owns their updates; calling public flushSync
			// here would only hit its reentrancy backstop and emit a spurious warning.
			// A transition-only queue in an app armed for ViewTransition must reach the
			// regular flush controller. flushSync deliberately skips animations; using
			// it here meant the canonical onInput={() => startTransition(...)} pattern
			// could never call document.startViewTransition. flush() also knows how to
			// leave a second transition queued while an earlier one is still in flight.
			// Transitions waiting for their task commit here too, before the restore.
			if (TRANSITION_TASK_DRIVER) TRANSITION_TASK_DRIVER.adopt(true);
			if (VIEW_TRANSITION_DRIVER && VIEW_TRANSITION_DRIVER.queueAllTransition()) flush();
			else flushSync(noop);
		}
		// The restore runs even when NO work was scheduled — a rejected/unheard
		// edit (no onInput, or an Object.is-equal setState) schedules nothing and
		// is exactly the case that must snap back (React's restoreControlledState).
		restoreControlledStates();
	}
	// Clear after the click's own handlers (and its outermost flush, when this is
	// not a nested dispatch), including canceled/eventless activations.
	if (type.name === 'click') activationCheckable = null;
}

// ---------------------------------------------------------------------------
// Controlled form components — React-parity `value`/`checked` semantics on
// NATIVE events (no synthetic layer; the no-synthetic-events divergence
// stands — see docs/react-parity-migration-plan.md §2).
//
// Model: the compiler routes `value`/`checked`/`defaultValue`/`defaultChecked`
// on <input>/<textarea>/<select> to the helpers below instead of setAttribute
// (and setAttribute routes the same names on form tags here, so spreads,
// de-opt descriptors, and previously-compiled output get identical semantics).
// A helper writes the DOM PROPERTY, diffs against the DOM (not a compiler
// `_prev$` cache — the DOM is what the user mutates), and ARMS the element
// with a `$$ctrl` state record. Two mechanisms keep the DOM equal to the last
// RENDERED value (React's controlled contract):
//   1. Per-commit reassert — controlled bindings re-run their helper on every
//      render of the owning block with NO prev-value guard; the DOM-diff
//      inside makes an unchanged value free.
//   2. Event-side restore — the delegated dispatchers enqueue armed event
//      targets; after the discrete flush (maybeFlushDiscrete) the restore
//      pass reverts any DOM drift the handlers did not commit. This is
//      React's enqueueStateRestore/restoreControlledState pair: a keystroke
//      the handler rejects (or never hears — no onInput) snaps back before
//      the browser regains control.
// Direct programmatic writes (`el.value = x` outside any event) STICK until
// the element's block next renders — same as React.
// ---------------------------------------------------------------------------

/**
 * Sentinel for "the value prop is not controlling this element" — distinct
 * from every real value (a nullish `value` means uncontrolled, like React).
 */
export const UNCONTROLLED: unique symbol = Symbol('octane.uncontrolled');

/**
 * Per-element controlled state, stored as a `$$ctrl` expando (octane's slot
 * idiom — `$oclick`, `$$formAction`; a WeakMap would cost a hash lookup on
 * every delegated event). One monomorphic shape for every control kind.
 */
export interface ControlledState {
	/**
	 * Last RENDERED value, RAW — not stringified: the number-input compare
	 * needs the raw prop (see valueNeedsWrite). UNCONTROLLED when the value
	 * prop is absent/nullish.
	 */
	v: unknown;
	/** Last rendered checked; -1 = checked is not controlled. */
	c: boolean | -1;
	/**
	 * Controlled-<select> projection target (a String value, or a Set of them
	 * for `multiple`); null = the select's value is not controlled.
	 */
	sv: string | Set<string> | null;
	/** A value/checked binding has run at least once (mount discriminator +
	 *  controlled↔uncontrolled flip detection). */
	sawV: boolean;
	sawC: boolean;
	/** The first defaultChecked binding has initialized the live checkedness. */
	sawDC: boolean;
	/** Last defaultValue. Select defaults project only on mount or a multiple flip. */
	dvv: unknown;
	/** True during IME composition and while its final committed input can arrive. */
	composing: boolean;
	/** undefined until text composition is armed; null or the pending completion task. */
	compositionEndTask: ReturnType<typeof setTimeout> | null | undefined;
	/** Select re-projection already queued for the pending commit. */
	queued: boolean;
	/** Whether the compiler's spread-aware form aggregation path has committed. */
	formSeen: boolean;
	/** Previous final <select multiple> mode. */
	formMultiple: boolean;
	/** A textarea's children writer was present at the previous commit, so its
	 *  live child binding may still own Text inside the element. */
	formChildren: boolean;
}

const CONTROLLED_DELIVERY = /* @__PURE__ */ Symbol('octane.controlledDelivery');
let controlledDeliverySequence = 0;

export function controlledDelivery(event: Event): number | undefined {
	return event.type === 'input' || event.type === 'change'
		? (event as any)[CONTROLLED_DELIVERY]
		: undefined;
}

export function beginControlledDelivery(event: Event, fresh: boolean): void {
	if (event.type !== 'input' && event.type !== 'change') return;
	if (fresh) {
		// Never reset: a stopped delivery can still have a delayed fallback.
		const sequence = ++controlledDeliverySequence;
		(event as any)[CONTROLLED_DELIVERY] = inFlush ? -sequence : sequence;
	}
	const type = _delegated.get(event.type) ?? _delegatedCapture.get(event.type);
	// Only an observed capture has a finisher. A later stopped event with no
	// capture handler must not cancel an older delivery's only restoration.
	// Its bubble can take ownership if that segment actually arrives.
	if (type === undefined || (type.flags & EVENT_CAPTURE) === 0) return;
	const delivery = controlledDelivery(event);
	const target = event.target as any;
	if (
		delivery === undefined ||
		target === null ||
		(target.localName !== 'input' &&
			target.localName !== 'textarea' &&
			target.localName !== 'select')
	)
		return;
	// A control can arm below capture. Keep delivery ownership on the physical
	// host, outside its journaled controlled state, and never let an older outer
	// delivery reclaim a target after a nested edit or shadow-root continuation.
	const previous = target.$$restoreDelivery as number | undefined;
	if (previous === undefined || Math.abs(previous) < Math.abs(delivery))
		target.$$restoreDelivery = delivery;
}

// Armed elements an in-flight dispatch touched, paired with whether the edit
// arrived during a flush. Only those edits wait for held work after the flush;
// an outside event still restores before its dispatch returns. Tiny flat array
// + linear dedupe: one event targets one element; nesting stays single-digit.
export let pendingRestores: Array<Element | boolean> = [];

// The checkable input whose click ACTIVATION is currently in flight: the
// platform has toggled `checked` but the activation's `input`/`change`
// post-steps have not been dispatched yet. Commits inside this window use
// React's prop-diff (not DOM-diff) semantics for `checked`, so a handler's
// flushSync cannot revert the user's toggle before the native input/change
// handlers get to read it. Set by maybeEnqueueRestore and cleared at the end
// of that click's dispatch by maybeFlushDiscrete.
let activationCheckable: Element | null = null;

// Installed by the first retained controlled-checked binding. Generic text and
// select restoration keep only the nullable call when checked/radio support is
// absent, allowing the concrete checked + radio-group graph to tree-shake.
let CHECKED_RESTORE: ((input: HTMLInputElement, ctrl: ControlledState) => void) | null = null;
// Likewise installed by the first controlled select value, the only writer of
// a non-null `sv`, so restoration keeps no select projection without one.
let SELECT_RESTORE: typeof projectSelectValue | null = null;

// Commit-deferred controlled work, drained at the HEAD of commitEffects:
//  - select re-projection: compiled binding mounts run BEFORE the same
//    render's @for/@if construct calls, so a `<select value>` binding fires
//    while its @for options don't exist yet — the commit-phase pass
//    re-projects once the whole tree is built (React resolves selects
//    post-mount the same way).
//  - select defaultValue: same ordering problem, projected with
//    defaultSelected stamped.
//  - dev native-event diagnostics: evaluated only after ALL of an element's
//    bindings mounted (an event slot may be stamped after value/checked in
//    source order). This queue is null in production, so an optimized build
//    allocates no diagnostic array or per-element diagnostic record.
let SELECT_SYNCS: HTMLSelectElement[] = [];
let SELECT_DEFAULT_SYNCS: { el: HTMLSelectElement; value: unknown }[] = [];
export interface DevFormCheck {
	element: Element;
	lifetime: { active: boolean } | null;
}
let DEV_FORM_CHECKS: DevFormCheck[] | null = process.env.NODE_ENV === 'production' ? null : [];
export const DEV_FORM_CHECK_MARK = /* @__PURE__ */ Symbol('octane.devFormCheck');
const DEV_FORM_CHECK_LINEAR_LIMIT = 8;
export let DEV_FORM_CHECK_GENERATION = 1;
let AUTOFOCUS_QUEUE: Element[] = [];

/** True when controlled commit work is queued (folds into hasPendingWork). */
export function hasControlledSyncs(): boolean {
	return (
		SELECT_SYNCS.length > 0 ||
		SELECT_DEFAULT_SYNCS.length > 0 ||
		(DEV_FORM_CHECKS !== null && DEV_FORM_CHECKS.length > 0) ||
		AUTOFOCUS_QUEUE.length > 0
	);
}

/**
 * Compiler-emitted binding for `autoFocus` (React parity): client mounts never
 * write an attribute and focus supported controls once, before layout effects.
 * Server-rendered controls keep their existing autofocus attribute but are
 * never refocused during hydration; later updates are likewise ignored.
 */
export function setAutoFocus(el: Element, value: unknown): void {
	if ((el as any).$$afSeen !== undefined) return; // mount-only
	(el as any).$$afSeen = true;
	if (!value) return;
	switch (el.localName) {
		case 'button':
		case 'input':
		case 'select':
		case 'textarea':
			break;
		default:
			return;
	}
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) return;
	queueControlledCommit(AUTOFOCUS_QUEUE, el);
}

/** Text-entry controls (IME-capable; their diagnostic specifically requires onInput). */
function isTextEntry(el: Element): boolean {
	if (el.localName === 'textarea') return true;
	if (el.localName !== 'input') return false;
	switch ((el as HTMLInputElement).type) {
		case 'text':
		case 'search':
		case 'url':
		case 'tel':
		case 'password':
		case 'email':
		case 'number':
			return true;
	}
	return false;
}

// IME guard — DIRECT per-element listeners (not delegation), attached once at
// arm time: a user handler's stopPropagation can never starve the composing
// flag. A cancellable task after compositionend leaves the browser's final
// committed input observable; blur gets a temporary listener only while an
// actual composition is active, so interrupted sessions cannot stay stuck.
function onCtrlCompositionStart(e: Event): void {
	const el = e.currentTarget as Element;
	const ctrl = (el as any).$$ctrl as ControlledState | undefined;
	if (ctrl === undefined) return;
	if (ctrl.compositionEndTask !== undefined && ctrl.compositionEndTask !== null) {
		clearTimeout(ctrl.compositionEndTask);
		ctrl.compositionEndTask = null;
	}
	ctrl.composing = true;
	el.addEventListener('blur', onCtrlCompositionEnd);
}
export function onCtrlCompositionEnd(e: Event): void {
	const el = e.currentTarget as Element;
	const ctrl = (el as any).$$ctrl as ControlledState | undefined;
	if (ctrl === undefined) return;
	el.removeEventListener('blur', onCtrlCompositionEnd);
	if (ctrl.compositionEndTask !== undefined && ctrl.compositionEndTask !== null) {
		clearTimeout(ctrl.compositionEndTask);
	}
	// Android keyboards can dispatch the committed input after compositionend,
	// a microtask checkpoint, and the next task. Give that input a full turn;
	// blur needs no extra turn because it has already interrupted the session.
	ctrl.composing = true;
	const settleComposition = () => {
		ctrl.compositionEndTask = null;
		ctrl.composing = false;
		restoreControlledElement(el);
	};
	ctrl.compositionEndTask =
		e.type === 'blur'
			? setTimeout(settleComposition, 0)
			: setTimeout(() => {
					ctrl.compositionEndTask = setTimeout(settleComposition, 0);
				}, 0);
}

/** Get-or-create the shared controlled-state record and restoration listeners. */
export function renderControlledState(el: Element): ControlledState | undefined {
	const state = (el as any).$$ctrl as ControlledState | undefined;
	return state;
}

/** Full arming for controls that may accept IME text composition. */
export function armControlled(el: Element): ControlledState {
	let ctrl = renderControlledState(el);
	if (ctrl === undefined) ctrl = armControlledBase(el);
	// Direct checked-only compiler sites use armControlledBase instead. Their
	// statically-known checkbox/radio type proves these text listeners are dead.
	// Recheck existing records so a dynamic date-to-text type change can arm IME.
	if (ctrl.compositionEndTask === undefined && isTextEntry(el)) {
		ctrl.compositionEndTask = null;
		el.addEventListener('compositionstart', onCtrlCompositionStart);
		el.addEventListener('compositionend', onCtrlCompositionEnd);
	}
	return ctrl;
}

/**
 * Does the DOM value differ from the RAW rendered value? Number inputs
 * compare LOOSELY against the raw prop (React updateInput verbatim): state
 * `1` vs DOM "1.0" must NOT clobber (the user may be mid-edit), while `0` vs
 * "" must write (value={0} means "show 0"). Everything else compares the
 * exact string.
 */
function valueNeedsWrite(el: HTMLInputElement | HTMLTextAreaElement, raw: unknown): boolean {
	if ((el as HTMLInputElement).type === 'number') {
		// eslint-disable-next-line eqeqeq
		return (raw === 0 && el.value === '') || el.value != (raw as any);
	}
	return el.value !== toControlledString(raw);
}

// DEV (gated on the dev-compile `__oct_loc` stamp, like the hydration
// warnings): React's controlled↔uncontrolled flip warning.
function devWarnControlledFlip(el: Element, toControlled: boolean): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if ((el as any).__oct_loc === undefined) return;
	console.error(
		`A component is changing ${toControlled ? 'an uncontrolled' : 'a controlled'} ` +
			`${el.localName} to be ${toControlled ? 'controlled' : 'uncontrolled'}. This is likely ` +
			`caused by the value changing from ${
				toControlled ? 'undefined to a defined value' : 'a defined value to undefined'
			}, which should not happen. Decide between using a controlled or uncontrolled ` +
			`${el.localName} for the lifetime of the component (controlled: \`value\`/\`checked\`; ` +
			'uncontrolled: `defaultValue`/`defaultChecked`).',
	);
}

interface DevFormDiagnosticState {
	/** Last emitted broken-state signature; null after a valid commit. */
	last: string | null;
	/** The compiler already published the onChange-specific warning. */
	staticNativeChange: boolean;
	/** Final authoring props observed on this development-compiled host. */
	authoringProps?: Record<string, unknown>;
	/** Deferred selected binding, evaluated once only after its mount update. */
	authoringSelected?: () => unknown;
	/** Structural children markers published by DEV-only compiler bindings. */
	authoringChildren?: 'textarea' | 'option';
	/** Each contradictory authoring warning is emitted once per host. */
	authoringWarnings?: Set<string>;
}

function getDevFormDiagnosticState(el: Element): DevFormDiagnosticState | undefined {
	return (el as any).__oct_form_diagnostic as DevFormDiagnosticState | undefined;
}

function ensureDevFormDiagnosticState(el: Element): DevFormDiagnosticState {
	let state = getDevFormDiagnosticState(el);
	if (state === undefined) {
		state = { last: null, staticNativeChange: false };
		(el as any).__oct_form_diagnostic = state;
	}
	return state;
}

/**
 * Whether this runtime host write belongs to development-compiled output.
 * The source-location side channel is absent from prod-compiled bodies, which
 * keeps the octane-prod project silent even though it imports the dev runtime.
 * Walk parent blocks for runtime string hosts/de-opt descriptors whose own
 * synthetic body has no source table.
 */
function hasDevFormDiagnosticContext(el: Element, scope?: Scope): boolean {
	if ((el as any).__oct_loc !== undefined) return true;
	let block = (scope ?? CURRENT_SCOPE)?.block ?? CURRENT_BLOCK;
	while (block !== null) {
		if (
			block.locs !== undefined ||
			block.locFile !== undefined ||
			componentSourceLoc(block.body) !== undefined
		)
			return true;
		block = block.parentBlock;
	}
	return false;
}

function hasPotentialFormDiagnostic(el: Element): boolean {
	if (el.namespaceURI !== HTML_NS || isHtmlCustomElement(el)) return false;
	if (getDevFormDiagnosticState(el) !== undefined) return true;
	const ctrl = renderControlledState(el);
	if (el.localName === 'select') return ctrl !== undefined && ctrl.sv !== null;
	if (el.localName === 'input') {
		const input = el as HTMLInputElement;
		if (input.type === 'checkbox' || input.type === 'radio') {
			return ctrl !== undefined && ctrl.c !== -1;
		}
	}
	if (!isTextEntry(el)) return false;
	return (
		(ctrl !== undefined && ctrl.v !== UNCONTROLLED) ||
		isUsableEventSlot((el as any).$ochange) ||
		isUsableEventSlot((el as any)['$ocapture:change'])
	);
}

function indexOfDevFormCheck(queue: DevFormCheck[], element: Element): number {
	for (let i = 0; i < queue.length; i++) if (queue[i].element === element) return i;
	return -1;
}

// Queue once per element/commit. Validation itself runs at the head of commit,
// after final source/spread order has settled and before layout effects.
export function queueDevFormDiagnostic(el: Element, scope?: Scope, force = false): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	const q = DEV_FORM_CHECKS;
	if (q === null || (!force && !hasDevFormDiagnosticContext(el, scope))) return;
	if (!force && !hasPotentialFormDiagnostic(el)) return;
	// Keep the usual tiny queue property-free, then cap membership work by stamping
	// the first full batch and every later host with this queue's generation.
	if (q.length < DEV_FORM_CHECK_LINEAR_LIMIT) {
		if (indexOfDevFormCheck(q, el) !== -1) return;
		queueDevFormCheck(q, el, scope ?? CURRENT_SCOPE ?? CURRENT_BLOCK);
		if (q.length < DEV_FORM_CHECK_LINEAR_LIMIT) return;
		for (let i = 0; i < q.length; i++) {
			(q[i].element as any)[DEV_FORM_CHECK_MARK] = DEV_FORM_CHECK_GENERATION;
		}
		return;
	}
	const host = el as any;
	if (host[DEV_FORM_CHECK_MARK] === DEV_FORM_CHECK_GENERATION) return;
	queueDevFormCheck(q, el, scope ?? CURRENT_SCOPE ?? CURRENT_BLOCK);
	host[DEV_FORM_CHECK_MARK] = DEV_FORM_CHECK_GENERATION;
}

/** Compiler-only DEV marker for form hosts whose authoring is otherwise baked. */
export function queueFormAuthoringDiagnostic(
	el: Element,
	kind: string,
	selected?: boolean | (() => unknown),
): void {
	if (process.env.NODE_ENV === 'production') return;
	const state = ensureDevFormDiagnosticState(el);
	if (kind === 'textarea-children') state.authoringChildren = 'textarea';
	else if (kind === 'option-children') state.authoringChildren = 'option';
	else if (kind === 'option-selected') {
		if (typeof selected === 'function') state.authoringSelected = selected;
		else (state.authoringProps ??= Object.create(null))['selected'] = selected ?? true;
	}
	queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
}

export function queueFormActionAuthoringDiagnostic(el: Element): void {
	if (process.env.NODE_ENV === 'production') return;
	if (!hasDevFormDiagnosticContext(el, CURRENT_SCOPE ?? undefined)) return;
	ensureDevFormDiagnosticState(el);
	queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
}

/** @internal Compiler helper for a final-props runtime-check host. */
export function queueNativeChangeDiagnostic(el: Element): void {
	if (process.env.NODE_ENV !== 'production')
		queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
}

/** @internal Compiler helper for a host whose build warning already fired. */
export function markNativeChangeDiagnosticStatic(el: Element): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	ensureDevFormDiagnosticState(el).staticNativeChange = true;
	queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
}

/** Consume compiler descriptor metadata without ever reflecting it to the DOM. */
export function setNativeChangeDiagnosticMetadata(el: Element, value: unknown): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	if (value === 'static') {
		markNativeChangeDiagnosticStatic(el);
		return;
	}
	const state = getDevFormDiagnosticState(el);
	if (state !== undefined) state.staticNativeChange = false;
	if (value === 'runtime') queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
}

/**
 * Compiler-emitted binding for a controlled `value` on <input>/<textarea>
 * (spread/de-opt/legacy-compiled writes are routed here by setAttribute).
 * React semantics: the prop DRIVES the DOM property; a nullish value means
 * uncontrolled (leave the DOM alone). The value ATTRIBUTE mirrors the prop
 * (React's attribute-syncing cascade: value, else defaultValue) — an
 * attribute write never clobbers what the user typed, and it keeps SSR
 * output, form.reset() baselines, and differential byte-compares aligned.
 */
export function setValue(el: Element, value: unknown): void {
	// An unmatched scalar or spread is not permission to steal an offered control.
	if (hydrationStarted && CURRENT_SCOPE?.block.idState.renderOwner?.controlLeases?.has(el))
		HYDRATION_DRIVER!.presentationMiss(false);
	const input = el as HTMLInputElement | HTMLTextAreaElement;
	const ctrl = armControlled(el);
	const first = !ctrl.sawV;
	// Hydration ADOPTS the live value with no warnings: as in React's
	// initInput/initTextarea, only the attribute mirror below takes the client
	// value. An unedited control follows it, and the dirty-value flag keeps
	// pre-hydration user input until the element's first real commit or
	// discrete event. A fresh structural replacement is client-built and needs
	// normal projection.
	const adopted = hydrating && first ? CURSOR !== null : false;
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(ctrl);
		journalBag();
	}
	ctrl.sawV = true;
	if (value == null) {
		if (process.env.NODE_ENV !== 'production' && !first && ctrl.v !== UNCONTROLLED)
			devWarnControlledFlip(el, false);
		// React parity: mounting/flipping to uncontrolled leaves the DOM as-is.
		ctrl.v = UNCONTROLLED;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
		return;
	}
	const s = toControlledString(value);
	if (first) {
		ctrl.v = value;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
		if (!adopted) {
			// PROPERTY first (React initInput order): the write marks the control
			// DIRTY, so the attribute write below — and any later defaultValue
			// binding — can never drag the live value along.
			if (input.value !== s) input.value = s;
			// The value ATTRIBUTE mirrors the controlled value (React's
			// attribute-syncing cascade: value wins over defaultValue).
			input.defaultValue = s;
			return;
		}
		// The adopted control's mirror takes the client value at commit.
		atCommit(mirrorDefaultValue, [input, s]);
		return;
	} else {
		if (process.env.NODE_ENV !== 'production' && ctrl.v === UNCONTROLLED)
			devWarnControlledFlip(el, true);
		const prev = ctrl.v;
		ctrl.v = value;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
		// PROPERTY before attribute (React updateInput order), as on mount. A control
		// a native form reset left NON-DIRTY follows its value attribute, so an
		// attribute-first write would move the live value itself and make the
		// property write below look unnecessary — leaving the control non-dirty
		// (a later attribute change would drag the value again) where React's
		// property write marks it dirty. Reachable whenever the commit lands after
		// the reset button's default action, i.e. any script-dispatched click.
		// IME: an UNCHANGED rendered value must not cancel an active composition;
		// a genuinely changed one still wins (React: setState during composition).
		const update: ControlledValueWrite = [
			input,
			value,
			s,
			!(ctrl.composing && Object.is(prev, value)),
		];
		// A hydrating render-phase update writes its adopted control at commit.
		if (hydrating && CURSOR !== null) atCommit(writeControlledValue, update);
		else writeControlledValue(update);
		return;
	}
	mirrorDefaultValue([input, s]);
}

type ControlledValueWrite = [
	input: HTMLInputElement | HTMLTextAreaElement,
	value: unknown,
	s: string,
	live: boolean,
];

/** A controlled value's update (setValue): the live value, then the attribute mirror. */
function writeControlledValue([input, value, s, live]: ControlledValueWrite): void {
	if (live && valueNeedsWrite(input, value)) input.value = s;
	mirrorDefaultValue([input, s]);
}

/**
 * The value attribute, or a textarea's text, mirrors controlled value `s`
 * (React's attribute-syncing cascade). Replacing textarea child text between
 * edits splits native Undo groups, so its Text node stays.
 */
function mirrorDefaultValue([input, s]: [HTMLInputElement | HTMLTextAreaElement, string]): void {
	if (input.defaultValue === s) return;
	const text = input.localName === 'textarea' ? getFirstChild(input) : null;
	if (text !== null && text.nodeType === 3 && getNextSibling(text) === null)
		(text as Text).data = s;
	else input.defaultValue = s;
}

/**
 * Hydration's first writes to an adopted checkable, at commit: the live
 * checkedness is re-assigned, which separates it from the server default as
 * React's initInput does, and the default takes `baseline` unless it is null.
 */
function adoptCheckedness([input, reassign, baseline]: [
	HTMLInputElement,
	boolean,
	boolean | null,
]): void {
	// eslint-disable-next-line no-self-assign
	if (reassign) input.checked = input.checked;
	if (baseline !== null && input.defaultChecked !== baseline) input.defaultChecked = baseline;
}

/** An uncontrolled control loses its default (setDefaultValue). */
function clearDefaultValue(input: HTMLInputElement | HTMLTextAreaElement): void {
	if (input.localName === 'input') input.removeAttribute('value');
	else input.defaultValue = '';
}

/** Run `fn` at commit when `deferred`, a hydrating render's write to adopted DOM, else now. */
export function atCommitIf<T>(deferred: boolean, fn: (arg: T) => void, arg: T): void {
	if (deferred) atCommit(fn, arg);
	else fn(arg);
}

/** Hydration's default for an adopted uncontrolled `input`, `s`, at commit (setDefaultValue). */
function adoptDefaultValue([input, s]: [HTMLInputElement | HTMLTextAreaElement, string]): void {
	if (
		input.defaultValue !== s ||
		(s === '' && input.localName === 'input' && !input.hasAttribute('value'))
	)
		input.defaultValue = s;
}

/**
 * Compiler-emitted binding for a controlled `checked` on <input> (checkbox /
 * radio). Property-driven; the checked ATTRIBUTE mirrors only the INITIAL
 * state (React with attribute-syncing never updates it afterwards).
 */
function setCheckedState(input: HTMLInputElement, value: unknown, ctrl: ControlledState): void {
	const first = !ctrl.sawC;
	ctrl.sawC = true;
	if (value == null) {
		if (process.env.NODE_ENV !== 'production' && !first && ctrl.c !== -1)
			devWarnControlledFlip(input, false);
		ctrl.c = -1;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(input, CURRENT_SCOPE ?? undefined);
		return;
	}
	const b = !!value;
	CHECKED_RESTORE ??= restoreCheckedState;
	if (first) {
		ctrl.c = b;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(input, CURRENT_SCOPE ?? undefined);
		// PROPERTY first (marks checkedness dirty — see setValue), then the
		// attribute baseline (React's cascade: checked wins over defaultChecked).
		// Hydration re-assigns the live (server or user) selection instead, as
		// React's initInput does, which separates it from the server default,
		// including for a later controlled → default flip: at commit.
		ctrl.sawDC = true;
		if (hydrating && CURSOR !== null) {
			atCommit(adoptCheckedness, [input, true, b]);
			return;
		}
		input.checked = b;
		if (input.defaultChecked !== b) input.defaultChecked = b;
		return;
	}
	if (process.env.NODE_ENV !== 'production' && ctrl.c === -1) devWarnControlledFlip(input, true);
	// While a click activation is in flight (platform toggled the DOM;
	// input/change not yet dispatched), an UNCHANGED prop must not clobber the
	// user's toggle — React's update path diffs prev props, not the DOM, so a
	// mid-dispatch flushSync commit leaves the drift for the event-side restore.
	// This covers the activated element AND its radio-group cousins: the platform
	// unchecked the cousin as part of the same toggle, and re-checking it would
	// make the browser uncheck the activation target before its follow-up events
	// fire. A prop that actually CHANGED in this window still writes.
	const changed = b !== ctrl.c;
	ctrl.c = b;
	if (process.env.NODE_ENV !== 'production')
		queueDevFormDiagnostic(input, CURRENT_SCOPE ?? undefined);
	if ((changed || !inActivationWindow(input)) && input.checked !== b) input.checked = b;
}

/**
 * True while `input` is the checkable whose click activation is in flight, or
 * a same-group radio cousin of it (group scope mirrors restoreRadioCousins:
 * same non-empty name, same form owner).
 */
function inActivationWindow(input: HTMLInputElement): boolean {
	const target = activationCheckable as HTMLInputElement | null;
	if (target === null) return false;
	if (input === target) return true;
	return (
		input.type === 'radio' &&
		target.type === 'radio' &&
		input.name !== '' &&
		input.name === target.name &&
		input.form === target.form &&
		(input.form !== null || input.getRootNode() === target.getRootNode())
	);
}

export function setChecked(el: Element, value: unknown): void {
	const ctrl = armControlled(el);
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(ctrl);
		journalBag();
	}
	setCheckedState(el as HTMLInputElement, value, ctrl);
}

/**
 * Compiler-only checked binding for a statically-known checkbox/radio whose
 * type cannot be changed by a spread. It keeps the complete controlled record
 * and event restoration contract, but cannot need text-composition listeners.
 */
export function setCheckedCheckable(el: Element, value: unknown): void {
	const ctrl = armControlledBase(el);
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(ctrl);
		journalBag();
	}
	setCheckedState(el as HTMLInputElement, value, ctrl);
}

/**
 * Compiler-emitted binding for a controlled `value` on <select> (single and
 * `multiple`). The target is stored and projected onto the options at commit
 * (drainControlledSyncs), after the commit has placed the options this render
 * built, as React resolves selects post-mount. A root render projects nothing
 * itself, so a render that never commits leaves the selection alone; a write
 * outside one, such as a commit entry's, also projects at once (idempotent).
 */
export function setSelectValue(el: Element, value: unknown): void {
	const sel = el as HTMLSelectElement;
	const ctrl = armControlled(el);
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(ctrl);
		journalBag();
	}
	const first = !ctrl.sawV;
	ctrl.sawV = true;
	if (value == null) {
		if (process.env.NODE_ENV !== 'production' && !first && ctrl.sv !== null)
			devWarnControlledFlip(el, false);
		ctrl.sv = null;
		if (process.env.NODE_ENV !== 'production')
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
		return;
	}
	if (process.env.NODE_ENV !== 'production' && !first && ctrl.sv === null)
		devWarnControlledFlip(el, true);
	SELECT_RESTORE ??= projectSelectValue;
	if (sel.multiple) {
		if (!Array.isArray(value)) {
			if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
				console.error(
					'The `value` prop supplied to <select> must be an array if `multiple` is true.',
				);
			}
			return;
		}
		const set = new Set<string>();
		for (let i = 0; i < value.length; i++) set.add(toControlledString(value[i]));
		ctrl.sv = set;
	} else {
		if (Array.isArray(value)) {
			if (process.env.NODE_ENV !== 'production' && (el as any).__oct_loc !== undefined) {
				console.error(
					'The `value` prop supplied to <select> must be a scalar value if `multiple` is false.',
				);
			}
			return;
		}
		ctrl.sv = toControlledString(value);
	}
	if (process.env.NODE_ENV !== 'production') queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined);
	// Hydration ADOPTS the server-emitted `selected` state — and must not
	// enqueue the commit sync either (the post-hydration microtask commit
	// would clobber a pre-hydration user selection). A fresh replacement has no
	// user state to preserve and follows the ordinary client-mount path.
	const hydration = hydrating ? CURSOR : null;
	if (hydration !== null) return;
	// A root render leaves the projection to its commit.
	const now = ROOT_RENDER_TRANSACTION === null;
	if (now) projectSelectValue(sel, ctrl.sv, false);
	if (!ctrl.queued || !now) {
		ctrl.queued = true;
		queueControlledCommit(SELECT_SYNCS, sel);
	}
}

/**
 * React updateOptions verbatim: multiple → per-option set membership;
 * single → FIRST match wins (the platform deselects the rest), no match →
 * first non-disabled option. `setDefaultSelected` additionally stamps
 * option.defaultSelected (the mount-time defaultValue projection).
 */
function projectSelectValue(
	sel: HTMLSelectElement,
	sv: string | Set<string>,
	setDefaultSelected: boolean,
): void {
	const options = sel.options;
	if (typeof sv !== 'string') {
		for (let i = 0; i < options.length; i++) {
			const option = options[i];
			const selected = sv.has(option.value);
			if (option.selected !== selected) option.selected = selected;
			if (setDefaultSelected) option.defaultSelected = selected;
		}
		return;
	}
	let defaultOption: HTMLOptionElement | null = null;
	for (let i = 0; i < options.length; i++) {
		const option = options[i];
		if (option.value === sv) {
			option.selected = true;
			if (setDefaultSelected) option.defaultSelected = true;
			return;
		}
		if (defaultOption === null && !option.disabled) defaultOption = option;
	}
	if (defaultOption !== null) defaultOption.selected = true;
}

/**
 * Compiler-emitted binding for `defaultValue` — the uncontrolled escape
 * hatch. Writes the DEFAULT (the value attribute / textarea text content /
 * option defaultSelected), never the live value: a dirty control keeps what
 * the user typed. Re-synced on updates (React parity; attribute-only).
 */
export function setDefaultValue(el: Element, value: unknown, initial?: boolean): void {
	const ctrl = armControlled(el);
	const hydration = hydrating ? CURSOR : null;
	if (el.localName === 'select') {
		const first = ctrl.dvv === UNCONTROLLED;
		const multiple = (el as HTMLSelectElement).multiple;
		const changedMultiple = ctrl.formMultiple !== multiple;
		if (first || changedMultiple) {
			if (TRANSITION_JOURNAL) {
				journalObjectOnce(ctrl);
				journalBag();
			}
			ctrl.dvv = value;
			ctrl.formMultiple = multiple;
			if (hydration !== null) return;
			if (value != null)
				queueControlledCommit(SELECT_DEFAULT_SYNCS, { el: el as HTMLSelectElement, value });
			else if (changedMultiple)
				projectSelectValue(el as HTMLSelectElement, multiple ? new Set<string>() : '', false);
		}
		return;
	}
	const first = initial ?? !ctrl.sawV;
	const previousDefault = ctrl.dvv;
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(ctrl);
		journalBag();
	}
	ctrl.sawV = true;
	ctrl.dvv = value;
	// Keep pre-hydration edits, but update the reset baseline through the native
	// defaultValue setter. A dirty control does not follow that default write.
	const adopted = hydration !== null;
	// A controlled `value` OWNS the attribute (React's cascade — the value
	// binding syncs it every commit); the default only writes when uncontrolled.
	if (ctrl.v !== UNCONTROLLED) return;
	const input = el as HTMLInputElement | HTMLTextAreaElement;
	if (value == null) {
		if (previousDefault !== UNCONTROLLED && previousDefault != null)
			atCommitIf(adopted, clearDefaultValue, input);
		return;
	}
	const s = toControlledString(value);
	if (adopted) {
		atCommit(adoptDefaultValue, [input, s]);
		return;
	}
	if (first && input.value !== s) input.value = s;
	adoptDefaultValue([input, s]);
}

/**
 * Compiler-only defaultValue binding for a statically-known input/textarea
 * with no value writer or spread. The element is necessarily uncontrolled, so
 * it needs neither a controlled-state record nor edit/composition listeners.
 */
export const DEFAULT_VALUE_BASELINE = Symbol('octane.defaultValue');
export const DEFAULT_CHECKED_INITIALIZED = Symbol('octane.defaultCheckedInitialized');

export function setDefaultValueUncontrolled(el: Element, value: unknown): void {
	const hydration = hydrating ? CURSOR : null;
	const input = el as HTMLInputElement | HTMLTextAreaElement;
	const previous = (input as any)[DEFAULT_VALUE_BASELINE] as string | null | undefined;
	const s = value == null ? null : toControlledString(value);
	if (TRANSITION_JOURNAL) {
		TRANSITION_JOURNAL.push(JOURNAL_PROP, input, DEFAULT_VALUE_BASELINE, previous);
		journalBag();
	}
	(input as any)[DEFAULT_VALUE_BASELINE] = s;
	const adopted = hydration !== null;
	if (s === null) {
		if (previous != null) atCommitIf(adopted, clearDefaultValue, input);
		return;
	}
	if (adopted) {
		atCommit(adoptDefaultValue, [input, s]);
		return;
	}
	if (previous === undefined && input.value !== s) input.value = s;
	adoptDefaultValue([input, s]);
}

/** Compiler-emitted binding for `defaultChecked` (uncontrolled checkables). */
export function setDefaultChecked(el: Element, value: unknown): void {
	const ctrl = armControlled(el);
	const input = el as HTMLInputElement;
	const adopted = hydrating ? CURSOR !== null : false;
	const first = !ctrl.sawDC;
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(ctrl);
		journalBag();
	}
	ctrl.sawDC = true;
	// Adopt the user's live choice, separated from the server's pristine default
	// so the client baseline (React's initInput) cannot drag it along, at commit.
	if (adopted) {
		const baseline = ctrl.c === -1 && value != null ? !!value : null;
		if (first || baseline !== null) atCommit(adoptCheckedness, [input, first, baseline]);
		return;
	}
	// A controlled `checked` owns the attribute baseline (React's cascade).
	if (ctrl.c !== -1) return;
	// React initInput marks the live checkedness dirty even when the initial
	// default is absent. Otherwise, the browser would move a still-pristine
	// checkbox whenever a later defaultChecked update changes its reset target.
	if (!adopted && first && !(DEFAULT_CHECKED_INITIALIZED in input))
		input.checked = value == null ? input.checked : !!value;
	if (value == null) return;
	const b = !!value;
	if (input.defaultChecked !== b) input.defaultChecked = b;
}

/**
 * Apply the final form-control prop set for a compiled host containing JSX
 * spreads. Each direct source is `[false, name, value]`; each snapshotted
 * spread is `[true, object]`. Resolving all sources first makes the controlled
 * cascades independent of object-key order (`multiple` before select `value`,
 * controlled value before its default fallback) while the compiler-owned
 * source bindings preserve authored evaluation order and single getter reads.
 */
export function setFormControlSources(
	el: Element,
	sources: ReadonlyArray<readonly [boolean, unknown, unknown?, boolean?]>,
): void {
	let value: unknown;
	let defaultValue: unknown;
	let checked: unknown;
	let defaultChecked: unknown;
	let multiple: unknown;
	const tag = el.localName;

	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		if (!source[0]) {
			const name = source[1];
			const next = source[2];
			switch (name) {
				case 'value':
					value = next;
					break;
				case 'defaultValue':
					defaultValue = next;
					break;
				case 'checked':
					if (tag === 'input') checked = next;
					break;
				case 'defaultChecked':
					if (tag === 'input') defaultChecked = next;
					break;
				case 'multiple':
					if (tag === 'select') multiple = next;
					break;
			}
			continue;
		}
		const spread = source[1];
		if (spread == null || (typeof spread !== 'object' && typeof spread !== 'function')) continue;
		const object = Object(spread) as Record<string, unknown>;
		if (Object.prototype.propertyIsEnumerable.call(object, 'value')) value = object['value'];
		if (Object.prototype.propertyIsEnumerable.call(object, 'defaultValue'))
			defaultValue = object['defaultValue'];
		if (tag === 'input') {
			if (Object.prototype.propertyIsEnumerable.call(object, 'checked'))
				checked = object['checked'];
			if (Object.prototype.propertyIsEnumerable.call(object, 'defaultChecked'))
				defaultChecked = object['defaultChecked'];
		} else if (tag === 'select' && Object.prototype.propertyIsEnumerable.call(object, 'multiple')) {
			multiple = object['multiple'];
		}
	}
	applyFormControlValues(el, tag, value, defaultValue, checked, defaultChecked, multiple);
}

/** Apply already-resolved values without rescanning a compiled host's sources. */
export function applyFormControlValues(
	el: Element,
	tag: string,
	value: unknown,
	defaultValue: unknown,
	checked: unknown,
	defaultChecked: unknown,
	multiple: unknown,
	hasChildren = false,
): void {
	const ctrl = armControlled(el);
	const first = !ctrl.formSeen;
	const previousMultiple = ctrl.formMultiple;
	if (TRANSITION_JOURNAL) {
		journalObjectOnce(ctrl);
		journalBag();
	}
	ctrl.formSeen = true;
	if (
		process.env.NODE_ENV !== 'production' &&
		hasDevFormDiagnosticContext(el, CURRENT_SCOPE ?? undefined)
	) {
		const diagnostic = ensureDevFormDiagnosticState(el);
		diagnostic.authoringProps = { value, defaultValue, checked, defaultChecked, multiple };
		if (
			(value !== undefined && defaultValue !== undefined) ||
			(tag === 'input' && checked !== undefined && defaultChecked !== undefined)
		) {
			queueDevFormDiagnostic(el, CURRENT_SCOPE ?? undefined, true);
		}
	}

	if (tag === 'input') {
		const input = el as HTMLInputElement;
		// React initInput normalizes the default before the controlled value even
		// though the controlled writer owns the final baseline. Preserve that
		// observable coercion order, and reuse the normalized default when it is
		// the uncontrolled fallback so a custom toString runs exactly once.
		const defaultString = defaultValue == null ? null : toControlledString(defaultValue);
		setValue(input, value);
		if (value == null) {
			setDefaultValue(input, defaultString, first);
		}
		setChecked(input, checked);
		if (checked == null && (defaultChecked != null || first))
			setDefaultChecked(input, defaultChecked);
		return;
	}

	if (tag === 'textarea') {
		const textarea = el as HTMLTextAreaElement;
		// Octane textarea children, whether authored, spread-held, or `children=`,
		// are a live text binding that owns the default. It only holds DOM when a
		// children writer rendered at the previous commit.
		const childrenOwned = ctrl.formChildren;
		ctrl.formChildren = hasChildren;
		setValue(textarea, value);
		if (value == null) {
			if (defaultValue != null) setDefaultValue(textarea, defaultValue, first);
			// React resets the default here because its children only seed the
			// initial value. Clearing it under a live child binding would detach
			// that binding's Text node, and later updates would write outside the
			// element.
			else if (!first && !childrenOwned && textarea.defaultValue !== '') textarea.defaultValue = '';
		}
		return;
	}

	const select = el as HTMLSelectElement;
	const multipleType = typeof multiple;
	const nextMultiple = !!multiple && multipleType !== 'function' && multipleType !== 'symbol';
	ctrl.formMultiple = nextMultiple;
	if (select.multiple !== nextMultiple) select.multiple = nextMultiple;
	if (!first && previousMultiple !== nextMultiple && value == null) {
		if (defaultValue != null) ctrl.dvv = UNCONTROLLED;
		else projectSelectValue(select, nextMultiple ? new Set<string>() : '', false);
	}
	setSelectValue(select, value);
	if (defaultValue != null) setDefaultValue(select, defaultValue);
	else if (first) ctrl.dvv = undefined;
}

interface FormDiagnosticOutcome {
	signature: string;
	message: string;
}

function nativeTextChangeMessage(
	el: Element,
	hasBubbleChange: boolean,
	controlled: boolean,
): string {
	const changeProp = hasBubbleChange ? 'onChange' : 'onChangeCapture';
	const inputProp = hasBubbleChange ? 'onInput' : 'onInputCapture';
	const host =
		el.localName === 'textarea' ? '<textarea>' : `<input type="${(el as HTMLInputElement).type}">`;
	const controlledHint = controlled
		? ' Because this field is controlled, edits are restored before the later native ' +
			'change can run; use `defaultValue` for editable commit-only behavior.'
		: '';
	const loc = (el as any).__oct_loc;
	const source = typeof loc === 'string' ? ` (${loc})` : '';
	return (
		`[OCTANE_NATIVE_TEXT_ONCHANGE] \`${changeProp}\` on ${host} is a native commit ` +
		`event in Octane; it does not run for each text edit. Use \`${inputProp}\` for ` +
		'per-edit updates. If commit/blur behavior is intentional, add ' +
		'`suppressNativeChangeWarning`.' +
		controlledHint +
		source
	);
}

/** Resolve the element's one current broken-state signature, if any. */
function formDiagnosticOutcome(el: Element): FormDiagnosticOutcome | null {
	if (el.namespaceURI !== HTML_NS || isHtmlCustomElement(el)) return null;
	const host = el as any;
	if (
		host.readOnly === true ||
		host.disabled === true ||
		el.hasAttribute('readonly') ||
		el.hasAttribute('disabled')
	)
		return null;
	// An aria-hidden control is a form-interop MIRROR (AT-hidden and, by the
	// pattern's contract, focus-excluded — e.g. the hidden "bubble inputs"
	// radix-style libraries render behind a custom control): users cannot reach
	// it, so handler-less controlled props are the intended wiring, not the
	// authoring mistake this diagnostic exists to catch.
	if (el.getAttribute('aria-hidden') === 'true') return null;

	const hasInput =
		isUsableEventSlot(host.$oinput as EventSlot) ||
		isUsableEventSlot(host['$ocapture:input'] as EventSlot);
	const hasBubbleChange = isUsableEventSlot(host.$ochange as EventSlot);
	const hasCaptureChange = isUsableEventSlot(host['$ocapture:change'] as EventSlot);
	const hasChange = hasBubbleChange || hasCaptureChange;
	const ctrl = host.$$ctrl as ControlledState | undefined;

	if (isTextEntry(el)) {
		const controlled = ctrl !== undefined && ctrl.v !== UNCONTROLLED;
		if (hasInput || hasHydrationControlSignalWriter(el, 'value')) return null;
		if (hasChange) {
			const dev = getDevFormDiagnosticState(el);
			if (host.__oct_native_change_suppressed === true || dev?.staticNativeChange === true)
				return null;
			const phase = hasBubbleChange ? (hasCaptureChange ? 'both' : 'bubble') : 'capture';
			return {
				signature: `native-change:${el.localName}:${(el as HTMLInputElement).type}:${phase}:${controlled ? 'controlled' : 'uncontrolled'}`,
				message: nativeTextChangeMessage(el, hasBubbleChange, controlled),
			};
		}
		if (!controlled) return null;
		return {
			signature: `controlled-text-missing:${el.localName}:${(el as HTMLInputElement).type}`,
			message:
				'You provided a `value` prop to a form field without an `onInput` handler. This ' +
				'will render a read-only field. If the field should be mutable use ' +
				'`defaultValue`. Otherwise, set either `onInput` or `readOnly`.',
		};
	}

	if (el.localName === 'select') {
		if (
			ctrl === undefined ||
			ctrl.sv === null ||
			hasInput ||
			hasChange ||
			hasHydrationControlSignalWriter(el, 'value')
		)
			return null;
		return {
			signature: 'controlled-select-missing',
			message:
				'You provided a `value` prop to a select without an `onInput` or `onChange` ' +
				'handler. This will render a read-only field. Set a usable native handler, ' +
				'`readOnly`, or use `defaultValue` for an uncontrolled field.',
		};
	}

	const input = el as HTMLInputElement;
	const checkable =
		input.localName === 'input' && (input.type === 'checkbox' || input.type === 'radio');
	if (!checkable || ctrl === undefined || ctrl.c === -1) return null;
	const hasClick =
		isUsableEventSlot(host.$oclick as EventSlot) ||
		isUsableEventSlot(host['$ocapture:click'] as EventSlot);
	if (hasClick || hasInput || hasChange || hasHydrationControlSignalWriter(el, 'checked'))
		return null;
	return {
		signature: `controlled-checkable-missing:${input.type}`,
		message:
			'You provided a `checked` prop to a checkbox or radio without an `onClick`, ' +
			'`onInput`, or `onChange` handler. This will render a read-only field. Set a ' +
			'usable native handler, `readOnly`, or use `defaultChecked` for an uncontrolled field.',
	};
}

export function drainDevFormDiagnostics(target?: Element): void {
	if (process.env.NODE_ENV === 'production') return; // build-time stripped
	let q = DEV_FORM_CHECKS;
	if (q === null || q.length === 0) return;
	if (target !== undefined) {
		// A direct signal subscription has already committed this native host.
		// Its diagnostic is not pending render work: leaving it in the queue can
		// make a native input flushSync and publish an unrelated held transition.
		const index = indexOfDevFormCheck(q, target);
		if (index < 0) return;
		const check = q[index];
		q.splice(index, 1);
		delete (target as any)[DEV_FORM_CHECK_MARK];
		q = [check];
	} else DEV_FORM_CHECKS = [];
	// Advance before validation: a console.error hook may synchronously render and
	// enqueue any still-pending host into the fresh queue owned by the reentrant commit.
	if (target === undefined) DEV_FORM_CHECK_GENERATION++;
	for (let i = 0; i < q.length; i++) {
		const { element: el, lifetime } = q[i];
		if (lifetime !== null && !lifetime.active) continue;
		const authoring = getDevFormDiagnosticState(el);
		if (authoring !== undefined) {
			let props = authoring.authoringProps;
			if (authoring.authoringSelected !== undefined) {
				const selected = authoring.authoringSelected();
				(props ??= Object.create(null)).selected =
					typeof selected === 'object' &&
					selected !== null &&
					(selected as DirectSignalBinding)[DIRECT_SIGNAL_BINDING] === true
						? (selected as DirectSignalBinding).value
						: selected;
			}
			const action = (el as any).$$formAction;
			if (typeof action === 'function') {
				const submitter = el.localName !== 'form';
				props = {
					...props,
					...(submitter
						? {
								formAction: action,
								type: el.getAttribute('type') ?? undefined,
								name: el.getAttribute('name') ?? undefined,
								formMethod: el.getAttribute('formmethod') ?? undefined,
								formEncType: el.getAttribute('formenctype') ?? undefined,
								formTarget: el.getAttribute('formtarget') ?? undefined,
							}
						: {
								action,
								method: el.getAttribute('method') ?? undefined,
								encType: el.getAttribute('enctype') ?? undefined,
								target: el.getAttribute('target') ?? undefined,
							}),
				};
			}
			const children =
				authoring.authoringChildren === 'textarea'
					? el.textContent
					: authoring.authoringChildren === 'option'
						? {}
						: undefined;
			for (const warning of formAuthoringDiagnostics(el.localName, props ?? {}, children)) {
				const reported = (authoring.authoringWarnings ??= new Set<string>());
				if (reported.has(warning.kind)) continue;
				reported.add(warning.kind);
				console.error(warning.message);
			}
		}
		const outcome = formDiagnosticOutcome(el);
		const previous = getDevFormDiagnosticState(el);
		if (outcome === null) {
			if (previous !== undefined) previous.last = null;
			continue;
		}
		if (previous?.last === outcome.signature) continue;
		ensureDevFormDiagnosticState(el).last = outcome.signature;
		console.error(outcome.message);
	}
}

/**
 * Drain the commit-deferred controlled work — called at the head of
 * commitEffects, i.e. after the render pass built/reconciled ALL DOM (so
 * select projections see their @for-built options and the dev check sees the
 * element's full listener set). Default projections run first; a controlled
 * `value` then wins.
 */
export function drainQueuedControlledSyncs(): void {
	if (AUTOFOCUS_QUEUE.length > 0) {
		const q = AUTOFOCUS_QUEUE;
		AUTOFOCUS_QUEUE = [];
		for (let i = 0; i < q.length; i++) {
			// Focus only if the commit actually connected the element (a caught
			// mount error may have torn the subtree down before this drain).
			if (q[i].isConnected) (q[i] as HTMLElement).focus();
		}
	}
	if (SELECT_DEFAULT_SYNCS.length > 0) {
		const q = SELECT_DEFAULT_SYNCS;
		SELECT_DEFAULT_SYNCS = [];
		for (let i = 0; i < q.length; i++) {
			const sel = q[i].el;
			const ctrl = (sel as any).$$ctrl as ControlledState | undefined;
			if (ctrl !== undefined && ctrl.sv !== null) continue; // controlled value owns the selection
			const v = q[i].value;
			const sv = sel.multiple
				? Array.isArray(v)
					? new Set<string>(v.map(toControlledString))
					: null
				: toControlledString(v);
			if (sv !== null) projectSelectValue(sel, sv, true);
		}
	}
	if (SELECT_SYNCS.length > 0) {
		const q = SELECT_SYNCS;
		SELECT_SYNCS = [];
		for (let i = 0; i < q.length; i++) {
			const ctrl = (q[i] as any).$$ctrl as ControlledState | undefined;
			if (ctrl === undefined) continue;
			ctrl.queued = false;
			if (ctrl.sv !== null) projectSelectValue(q[i], ctrl.sv, false);
		}
	}
	drainDevFormDiagnostics();
}

/**
 * Restore one armed element's DOM to its last RENDERED state (value/checked/
 * selection) — React's restoreControlledState. Composition holds the restore
 * off until its committed input or completion fallback; a disconnected
 * element has nothing to restore.
 */
export function restoreControlledElement(el: Element): void {
	const ctrl = (el as any).$$ctrl as ControlledState | undefined;
	if (ctrl === undefined || ctrl.composing || !el.isConnected) return;
	if (el.localName === 'select') {
		if (SELECT_RESTORE && ctrl.sv !== null) SELECT_RESTORE(el as HTMLSelectElement, ctrl.sv, false);
		return;
	}
	CHECKED_RESTORE?.(el as HTMLInputElement, ctrl);
	if (
		ctrl.v !== UNCONTROLLED &&
		valueNeedsWrite(el as HTMLInputElement | HTMLTextAreaElement, ctrl.v)
	) {
		(el as HTMLInputElement).value = toControlledString(ctrl.v);
	}
}

function restoreCheckedState(input: HTMLInputElement, ctrl: ControlledState): void {
	if (ctrl.c !== -1) {
		if (input.checked !== ctrl.c) input.checked = ctrl.c;
		// A radio's drift flips its GROUP cousins too (checking one unchecks
		// another) — restore every armed cousin to ITS rendered state
		// (React's updateNamedCousins).
		if (input.type === 'radio' && input.name !== '') restoreRadioCousins(input);
	}
}

function restoreRadioCousins(input: HTMLInputElement): void {
	const name = input.name;
	const group = radioGroupCandidates(input);
	for (let i = 0; i < group.length; i++) {
		const other = group[i] as HTMLInputElement;
		if (
			other === input ||
			other.localName !== 'input' ||
			other.type !== 'radio' ||
			other.name !== name ||
			other.form !== input.form
		) {
			continue;
		}
		const octrl = (other as any).$$ctrl as ControlledState | undefined;
		if (octrl !== undefined && octrl.c !== -1 && other.checked !== octrl.c) {
			other.checked = octrl.c;
		}
	}
}

/** Drain the event-restore queue (see maybeFlushDiscrete). */
export function restoreControlledStates(): void {
	if (pendingRestores.length === 0) return;
	// A handler inside a render/commit cannot flush its own update. The ambient
	// owner restores after its complete cascade.
	// A first root render can be active without entering the scheduler's flush.
	if (
		inFlush ||
		_dispatchDepth !== 0 ||
		ROOT_RENDER_TRANSACTION !== null ||
		(DEFERRED_LAYOUT_DRIVER && DEFERRED_LAYOUT_DRIVER.capturing())
	)
		return;
	// Pending root records may await resources after synchronous rendering ended.
	// Like queued work, they only hold edits captured during a flush.
	const waitForQueue = QUEUE.length > 0 || ROOT_RENDER_TRANSACTIONS.length > 0;
	const list = pendingRestores;
	pendingRestores = [];
	// Publish held edits before any restoration can synchronously dispatch a
	// newer event. That event owns its target's latest restore timing.
	if (waitForQueue) {
		for (let i = 0; i < list.length; i += 2) {
			if (list[i + 1] === true) pendingRestores.push(list[i], true);
		}
	}
	for (let i = 0; i < list.length; i += 2) {
		if (waitForQueue && list[i + 1] === true) continue;
		const element = list[i] as Element;
		if (pendingRestores.indexOf(element) === -1) restoreControlledElement(element);
	}
}

/**
 * True when `name` is a controlled prop (`value`/`checked`) on a form tag —
 * the prop-diff loops (setHostProps / applyHostProps) use this to BYPASS their
 * identity skip: controlled props must reassert on every commit even when the
 * rendered value is unchanged (the DOM may have drifted). The helpers diff
 * against the DOM, so the unconditional call stays cheap. The default* props
 * don't need the bypass (attribute-only; the DOM can't drift them).
 */
export function isControlledHostProp(el: Element, name: string): boolean {
	switch (name.length) {
		case 5:
			if (name !== 'value') return false;
			break;
		case 7:
			if (name !== 'checked') return false;
			break;
		default:
			return false;
	}
	const t = el.localName;
	return t === 'input' || t === 'textarea' || t === 'select';
}

/**
 * Enqueue the event's target for a post-flush restore when it is an armed
 * form control and the event can carry a user edit (see RESTORE_EVENTS).
 * Called by both delegated dispatchers, right after their dispatch stamp.
 */
export function maybeEnqueueRestore(
	event: Event,
	type: DelegatedEventType,
	duringFlush: boolean = inFlush,
	target?: EventTarget | null,
	delivery?: number,
): boolean {
	const t = (target === undefined ? event.target : target) as any;
	if (t === null || t.$$ctrl === undefined || (type.flags & EVENT_RESTORE) === 0) return true;
	if (event.type === 'input' || event.type === 'change') {
		if (target === undefined) {
			delivery = controlledDelivery(event);
			const previous = t.$$restoreDelivery as number | undefined;
			if (
				delivery !== undefined &&
				(previous === undefined || Math.abs(previous) < Math.abs(delivery))
			)
				t.$$restoreDelivery = delivery;
			// A delivered segment still owns its handlers' commit boundary. If a
			// nested edit is newer, retain that edit's restore timing while flushing
			// the work these handlers schedule.
			delivery = t.$$restoreDelivery;
		} else if (t.$$restoreDelivery !== delivery) return false;
		if (delivery !== undefined) duringFlush = delivery < 0;
	}
	const ctrl = t.$$ctrl as ControlledState;
	if (event.type === 'input' && ctrl.compositionEndTask !== undefined) {
		const inputEvent = event as InputEvent;
		const inputType = inputEvent.inputType;
		const composingInput =
			inputEvent.isComposing === true ||
			inputType === 'insertCompositionText' ||
			inputType === 'deleteCompositionText';
		if (composingInput) {
			if (ctrl.compositionEndTask !== null) {
				clearTimeout(ctrl.compositionEndTask);
				ctrl.compositionEndTask = null;
			}
			if (!ctrl.composing) t.addEventListener('blur', onCtrlCompositionEnd);
			ctrl.composing = true;
		} else if (ctrl.composing && typeof inputEvent.isComposing === 'boolean') {
			if (ctrl.compositionEndTask !== null) {
				clearTimeout(ctrl.compositionEndTask);
				ctrl.compositionEndTask = null;
			}
			t.removeEventListener('blur', onCtrlCompositionEnd);
			ctrl.composing = false;
		}
	}
	// A checkable's click never arms — its `input`/`change` follow-ups do
	// (see the RESTORE_EVENT_LIST comment: restoring after the click flush
	// would revert the toggle before the native handlers run).
	const checkable = t.localName === 'input' && (t.type === 'checkbox' || t.type === 'radio');
	if (event.type === 'click') {
		if (checkable) {
			// Mark the checkable whose ACTIVATION is in flight: the platform toggled
			// `checked` before this click dispatch, and its `input`/`change` post-steps
			// have not fired yet. A commit inside this window (a handler's flushSync —
			// press-state machinery does this) must not reassert the still-uncommitted
			// prop over the user's toggle: the checked binding switches to React's
			// prop-diff semantics for the marked element (see setCheckedState).
			if (ctrl.c !== -1) activationCheckable = t as Element;
			// The platform dispatches click after pre-activation, then input/change.
			// Remember that sequence so input does not restore before native change.
			// The task fallback owns canceled activation and propagation starvation:
			// after the browser finishes its post-click work, reassert the latest
			// rendered state if delegated change did not complete the sequence.
			t.$$checkableActivation = true;
			setTimeout(() => {
				if (t.$$checkableActivation === true) {
					t.$$checkableActivation = false;
					if (t === activationCheckable) activationCheckable = null;
					restoreControlledElement(t);
				}
			}, 0);
		}
		return true;
	}
	// The activation's follow-up events have arrived — the write-guard window is over.
	if (t === activationCheckable) activationCheckable = null;
	if (event.type === 'input' && t.localName === 'select') {
		// A native select pick dispatches `input` and then `change` in SEPARATE
		// tasks (popup commit, keyboard typeahead), with microtask checkpoints
		// between them. Octane exposes native onChange, so restoring here — or in
		// a microtask — would revert the user's pick before its `change` handler
		// can read it. Mark the pick in flight instead: the `change` dispatch
		// owns the after-handlers restore (the generic path below), and the task
		// fallback settles a sequence `change` never completes (a stopped
		// propagation below the root, or a synthetic lone `input`).
		t.$$selectPick = true;
		setTimeout(() => {
			if (t.$$selectPick === true) {
				t.$$selectPick = false;
				restoreControlledElement(t);
			}
		}, 0);
		return true;
	}
	if (event.type === 'input' && checkable && t.$$checkableActivation === true) return true;
	if (event.type === 'change') {
		if (checkable) t.$$checkableActivation = false;
		if (t.localName === 'select') t.$$selectPick = false;
	}
	const index = pendingRestores.indexOf(t);
	if (index === -1) pendingRestores.push(t, duringFlush);
	else pendingRestores[index + 1] = duringFlush;
	return true;
}
